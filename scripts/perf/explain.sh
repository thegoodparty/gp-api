#!/usr/bin/env bash
# Run EXPLAIN (ANALYZE, BUFFERS, VERBOSE) on a SQL query using DATABASE_URL.
# Backs up ai-rules/performance-tools.md §5.
#
# Requires: a Postgres connection. EITHER `psql` on PATH AND a reachable
# DATABASE_URL, OR a running Postgres docker container reachable via
# `docker exec` (set PG_DOCKER_CONTAINER if its name isn't goodparty-postgres).
#
# DATABASE_URL is looked up in this order:
#   1. The environment, if already set.
#   2. ./.env in the current working directory.
#   3. ../<parent worktree>/.env (i.e. the superproject's .env when this
#      script runs inside a git worktree without its own .env).
#
# Usage:
#   scripts/perf/explain.sh 'SELECT * FROM "User" WHERE "email" = '\''x@y.com'\'''
#   scripts/perf/explain.sh -f path/to/query.sql
#   scripts/perf/explain.sh --format JSON 'SELECT 1'
#   DATABASE_URL=postgres://... scripts/perf/explain.sh '...'
#   PG_DOCKER_CONTAINER=my-pg scripts/perf/explain.sh 'SELECT 1'
#
# NOTE: EXPLAIN ANALYZE *executes* its argument. This script always wraps
# the EXPLAIN in `BEGIN; ... ROLLBACK;` so accidentally-passed DML/DDL
# (UPDATE, DELETE, DROP, etc.) is rolled back — but transactional safety in
# Postgres is not absolute (e.g. side-effects from functions like nextval()
# persist). Still: don't deliberately pass write statements.
set -euo pipefail

FORMAT="TEXT"
QUERY=""
FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --format)
      # Whitelist against Postgres's four legal EXPLAIN FORMAT values.
      # $FORMAT is interpolated into the SQL string later; without this
      # check, '--format "TEXT) DROP TABLE foo; --"' would inject DDL.
      case "${2:-}" in
        TEXT|XML|JSON|YAML) FORMAT="$2" ;;
        *)
          echo "✗ Invalid --format value: '${2:-}'. Must be one of TEXT, XML, JSON, YAML." >&2
          exit 2
          ;;
      esac
      shift 2 ;;
    -f|--file) FILE="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^set -/p' "$0" | sed 's/^# \{0,1\}//;/^set -/d'
      exit 0 ;;
    -*)
      # Reject unrecognized flags so typos (e.g. `--fromat JSON 'SELECT 1'`)
      # don't get silently swallowed as QUERY values and produce a cryptic
      # Postgres syntax error instead of a usage hint.
      echo "✗ Unrecognized option: '$1'. Run with -h for usage." >&2
      exit 2 ;;
    *) QUERY="$1"; shift ;;
  esac
done

# --- DATABASE_URL resolution ---

extract_database_url() {
  # $1 = path to .env file. Echoes the value (no export, no side effects).
  # Handles: outer quotes (single or double), trailing inline `# comment`.
  local line val
  line="$(grep -E '^DATABASE_URL[[:space:]]*=' "$1" | head -1 || true)"
  if [[ -n "$line" ]]; then
    val="${line#*=}"
    # If the value is double-quoted, take everything up to the closing quote.
    if [[ "$val" == \"* ]]; then
      val="${val#\"}"
      val="${val%%\"*}"
    elif [[ "$val" == \'* ]]; then
      val="${val#\'}"
      val="${val%%\'*}"
    else
      # Unquoted: strip trailing whitespace and inline comments.
      val="${val%%#*}"
      val="${val%%[[:space:]]*}"
    fi
    echo "$val"
  fi
}

strip_prisma_params() {
  # Strip Prisma-specific query parameters that vanilla psql doesn't understand
  # (connection_limit, pool_timeout, pgbouncer, schema, etc.). Echoes the
  # cleaned URL — safe to pass to psql. The schema= value is preserved
  # separately via extract_pg_schema() and set on the session below.
  echo "${1%%\?*}"
}

extract_pg_schema() {
  # Extract the schema= value from a Prisma DATABASE_URL query string and
  # validate it as a plain SQL identifier. Defaults to "public" if absent
  # or non-conforming. $PG_SCHEMA is interpolated into the SQL string below,
  # so it MUST be validated here — interpolating untrusted URL text is unsafe.
  local qs schema
  qs="${1#*\?}"
  if [[ "$qs" == "$1" ]]; then
    echo "public"
    return
  fi
  schema="$(echo "$qs" | tr '&' '\n' | grep '^schema=' | head -1 | cut -d= -f2)"
  if [[ "$schema" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    echo "$schema"
  else
    echo "public"
  fi
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  ENV_SRC=""
  if [[ -f ./.env ]]; then
    ENV_SRC="./.env"
  elif command -v git >/dev/null 2>&1; then
    # In a git worktree without its own .env, look at the superproject.
    super_root="$(git rev-parse --show-superproject-working-tree 2>/dev/null || true)"
    if [[ -n "$super_root" && -f "$super_root/.env" ]]; then
      ENV_SRC="$super_root/.env"
    else
      # Or, the main worktree of THIS repo (if we're in a non-superproject worktree).
      common_dir="$(git rev-parse --git-common-dir 2>/dev/null || true)"
      if [[ -n "$common_dir" ]]; then
        main_worktree="$(dirname "$common_dir")"
        if [[ -f "$main_worktree/.env" ]]; then
          ENV_SRC="$main_worktree/.env"
        fi
      fi
    fi
  fi

  if [[ -n "$ENV_SRC" ]]; then
    DATABASE_URL="$(extract_database_url "$ENV_SRC")"
    [[ -n "$DATABASE_URL" ]] && echo "→ Loaded DATABASE_URL from $ENV_SRC" >&2
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "✗ DATABASE_URL is not set, and no .env was found (cwd, superproject, or main worktree)." >&2
  echo "  Set it explicitly: DATABASE_URL=postgres://... $0 '...'" >&2
  exit 1
fi

# Prisma URLs commonly include ?schema=public&connection_limit=... — psql
# rejects those. Strip the query string for psql, but keep the schema name
# so we can set search_path explicitly (people-api uses ?schema=green for
# the Voter table, so plain `"Voter"` lookups fail without this).
PSQL_URL="$(strip_prisma_params "$DATABASE_URL")"
PG_SCHEMA="$(extract_pg_schema "$DATABASE_URL")"

# Parse the URL into components so we DON'T pass the whole connection
# string (with embedded user:password) as a positional argument to psql /
# docker exec. argv is visible to any local user via `ps aux`; per
# ai-rules/security.md secrets must never appear there. We pass the
# password via the PGPASSWORD env var instead (and forward it through
# `docker exec -e PGPASSWORD` for the docker path).
url_decode() {
  # Decode %XX percent-encoding to literal bytes. libpq treats
  # PGUSER/PGPASSWORD as literal strings (not URI-decoded), so any
  # percent-encoded credential (e.g. `p%40ssword` for a literal `@` in
  # the password — which MUST be encoded in the URL form) needs to be
  # decoded here, or Postgres auth fails with a misleading "password
  # authentication failed" message.
  #
  # Steps:
  # 1. Escape every pre-existing `\` to `\\`. Without this step,
  #    `printf '%b'` would also interpret literal backslashes that
  #    happened to be in the credential — e.g. a password containing
  #    a literal `\n` would be silently turned into a newline, and
  #    auth would fail with a misleading "password authentication
  #    failed" error.
  # 2. Replace every `%` with `\x` so `%XX` becomes `\xXX` — the only
  #    backslash escape `printf '%b'` should interpret (since step 1
  #    already doubled any pre-existing backslashes, they survive as
  #    literal `\` after `%b`).
  local val="${1:-}"
  [[ -z "$val" ]] && return
  val="${val//\\/\\\\}"
  # Suppress printf's "missing hex digit for \x" for malformed `%` not
  # followed by two hex digits — a malformed URL would fail auth anyway,
  # and the warning would be misleading noise.
  printf '%b' "${val//%/\\x}" 2>/dev/null
}

parse_pg_url() {
  # Accepts postgres://[user[:pass]@]host[:port]/db. Side-effects only:
  # sets _pg_user, _pg_pass, _pg_host, _pg_port, _pg_db. The user and
  # password are URL-decoded so libpq sees the literal credential.
  local rest userinfo
  rest="${1#*://}"
  # Split off the /dbname suffix ONLY if it's present. Without this guard,
  # a URL like `postgres://u:p@host:5432` (no path) would leave _pg_db
  # set to the entire `u:p@host:5432` string (leaking the password into
  # PGDATABASE) and PGDATABASE would later cause psql to error with
  # `database "u:p@host:5432" does not exist`. Empty _pg_db is fine —
  # the export guards below skip empty values and libpq falls back to
  # the user name.
  if [[ "$rest" == */* ]]; then
    _pg_db="${rest##*/}"
    rest="${rest%/*}"
  else
    _pg_db=""
  fi
  if [[ "$rest" == *@* ]]; then
    # %@* takes everything before the LAST @, so passwords containing
    # un-encoded @ stay intact (rare but possible).
    userinfo="${rest%@*}"
    rest="${rest##*@}"
    if [[ "$userinfo" == *:* ]]; then
      _pg_user="$(url_decode "${userinfo%%:*}")"
      _pg_pass="$(url_decode "${userinfo#*:}")"
    else
      _pg_user="$(url_decode "$userinfo")"
      _pg_pass=""
    fi
  else
    _pg_user=""
    _pg_pass=""
  fi
  if [[ "$rest" == *:* ]]; then
    _pg_host="${rest%%:*}"
    _pg_port="${rest##*:}"
  else
    _pg_host="$rest"
    _pg_port="5432"
  fi
}

parse_pg_url "$PSQL_URL"

# Export libpq connection parameters as env vars instead of passing them
# in argv. This keeps the password out of `ps aux` and also handles the
# edge case where any individual component is empty (a positional
# `-U ""` would fail; an unset PGUSER falls back cleanly to libpq
# defaults). Respect any pre-set caller values.
[[ -n "$_pg_host" && -z "${PGHOST:-}"     ]] && export PGHOST="$_pg_host"
[[ -n "$_pg_port" && -z "${PGPORT:-}"     ]] && export PGPORT="$_pg_port"
[[ -n "$_pg_user" && -z "${PGUSER:-}"     ]] && export PGUSER="$_pg_user"
[[ -n "$_pg_db"   && -z "${PGDATABASE:-}" ]] && export PGDATABASE="$_pg_db"
[[ -n "$_pg_pass" && -z "${PGPASSWORD:-}" ]] && export PGPASSWORD="$_pg_pass"

# --- psql resolution: prefer host psql, fall back to docker exec ---

PSQL_CMD=()
if command -v psql >/dev/null 2>&1; then
  # Host psql inherits PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD from env.
  PSQL_CMD=(psql -X)
else
  CONTAINER="${PG_DOCKER_CONTAINER:-goodparty-postgres}"
  if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
    echo "→ Using 'docker exec $CONTAINER psql' (host psql not on PATH)" >&2
    # `-e VAR` (no value) forwards from the current env — keeps all
    # connection parameters out of the docker exec argv.
    PSQL_CMD=(docker exec -i \
      -e PGHOST -e PGPORT -e PGUSER -e PGDATABASE -e PGPASSWORD \
      "$CONTAINER" psql -X)
  else
    echo "✗ psql not on PATH and no '$CONTAINER' container running." >&2
    case "$(uname -s)" in
      Darwin) echo "  Install: brew install libpq && brew link --force libpq" >&2 ;;
      Linux)
        echo "  Install (Debian/Ubuntu): apt install postgresql-client" >&2
        echo "  Install (Fedora/RHEL):   dnf install postgresql" >&2
        ;;
      *) echo "  Install psql for your platform." >&2 ;;
    esac
    echo "  Or set PG_DOCKER_CONTAINER=<name> if your container has a different name." >&2
    echo "  (Looked for container: '$CONTAINER')" >&2
    exit 1
  fi
fi

if [[ -n "$FILE" ]]; then
  # Reject the both-provided case rather than silently dropping the
  # positional query — EXPLAIN ANALYZE executes its argument, so the
  # user would otherwise get a plan for a query they didn't intend to
  # run with no indication that their positional input was ignored.
  if [[ -n "$QUERY" ]]; then
    echo "✗ Provide either a positional query string OR -f file.sql, not both." >&2
    echo "  (Got both. The positional query would otherwise be silently dropped.)" >&2
    exit 2
  fi
  QUERY="$(cat "$FILE")"
fi

if [[ -z "$QUERY" ]]; then
  echo "✗ No query provided. Pass a query string or -f file.sql" >&2
  exit 2
fi

# Strip a trailing `;` along with any whitespace before it. Plain
# `${QUERY%;}` only matches a bare semicolon, so `'SELECT 1 ;'` (common
# when copy-pasting from psql or a SQL editor) would survive the strip
# and then false-positive on the interior-semicolon check below. The
# extglob `*([[:space:]]);` matches "zero-or-more whitespace then `;`".
shopt -s extglob
QUERY="${QUERY%%*([[:space:]]);}"
shopt -u extglob

# EXPLAIN wraps exactly one statement. Interior ';' usually means the user
# passed multiple statements (e.g. `-f migration.sql`) — psql splits on the
# interior ';' and runs everything after the first statement *without* the
# EXPLAIN wrapper, contradicting the user's intent. Reject early with a
# clear message.
# Note: this false-positives on queries with literal ';' inside string
# literals (rare for EXPLAIN targets); rewrite the query to avoid them or
# pass the relevant statement on its own.
if [[ "$QUERY" == *";"* ]]; then
  echo "✗ Query contains interior ';' — EXPLAIN wraps exactly one statement." >&2
  echo "  Pass a single SELECT/INSERT/UPDATE/DELETE, with no internal semicolons." >&2
  exit 2
fi

# SQL line comments (`--`) on the LAST LINE of the query would comment
# out the trailing `; ROLLBACK;` in the assembled SQL string, defeating
# the transaction safety wrapper. E.g. `'UPDATE foo SET x = 1 -- oops'`
# would expand to `... UPDATE foo SET x = 1 -- oops; ROLLBACK;` and the
# `ROLLBACK;` would never execute — the UPDATE would commit.
# Comments on earlier lines are safe because the newline terminates the
# line comment before the appended SQL. Block comments (`/* ... */`)
# inside a single line are safe *only when closed* — an unclosed `/*` on
# the last line has the same effect as `--` (Postgres treats everything
# after the unmatched `/*` as comment text, including our `; ROLLBACK;`).
last_line="${QUERY##*$'\n'}"
if [[ "$last_line" == *"--"* ]]; then
  echo "✗ Query's last line contains '--' — this would comment out the ROLLBACK safety wrapper." >&2
  echo "  Move or remove any SQL line comment at the end of the query." >&2
  exit 2
fi
# Reject any unclosed `/*` block comment ANYWHERE in the query (not just
# the last line). The previous last-line-only check missed multi-line
# cases like:
#     SELECT 1 /*
#     FROM foo
# where `/*` opens on line 1 and the last line has no `/*` — but the
# comment still extends to the end of the assembled SQL, swallowing
# `; ROLLBACK;` and committing any DML. (Postgres usually parse-errors
# this, which aborts the transaction and saves us — but defense in
# depth: reject before the round-trip.)
#
# Algorithm: strip every matched `/* … */` pair, then if any `/*` is
# left over it's unclosed. Uses perl with `-0` (whole input as one
# record) so the regex spans newlines — sed without `-z` is line-by-
# line on macOS and would false-positive on valid multi-line comments.
# The regex `[^*]*(\*[^/][^*]*)*` is the standard "stuff inside a block
# comment" subpattern.
if command -v perl >/dev/null 2>&1; then
  _stripped="$(printf '%s' "$QUERY" | perl -0pe 's|/\*[^*]*(\*[^/][^*]*)*\*/||g' 2>/dev/null || printf '%s' "$QUERY")"
  if [[ "$_stripped" == *'/*'* ]]; then
    echo "✗ Query contains an unclosed '/*' block comment — this would comment out the ROLLBACK safety wrapper." >&2
    echo "  Close the block comment with '*/' before the end of the query." >&2
    exit 2
  fi
fi
# (If perl is unavailable we fall through — the last-line `--` guard
# above still catches the original single-line `-- ` hazard, and
# Postgres parse-errors an unclosed `/*`, which aborts the transaction.)

# Wrap in BEGIN; ... ROLLBACK; so DML/DDL queries passed by accident can't
# mutate live data. EXPLAIN ANALYZE *executes* its argument unconditionally
# (this is a no-op for SELECT, but `EXPLAIN ANALYZE UPDATE ... ` would
# otherwise commit by default — and this script reads DATABASE_URL from the
# environment, which can point at prod). SET LOCAL keeps search_path
# changes scoped to this transaction.
SQL="BEGIN; SET LOCAL search_path TO \"$PG_SCHEMA\", public; EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT $FORMAT) $QUERY; ROLLBACK;"

echo "→ EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT $FORMAT) <query>"
echo "  (wrapped in BEGIN; ROLLBACK; search_path=$PG_SCHEMA,public)"
echo
exec "${PSQL_CMD[@]}" -c "$SQL"
