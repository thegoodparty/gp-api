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

# --- psql resolution: prefer host psql, fall back to docker exec ---

PSQL_CMD=()
if command -v psql >/dev/null 2>&1; then
  PSQL_CMD=(psql "$PSQL_URL" -X)
else
  CONTAINER="${PG_DOCKER_CONTAINER:-goodparty-postgres}"
  if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
    echo "→ Using 'docker exec $CONTAINER psql' (host psql not on PATH)" >&2
    PSQL_CMD=(docker exec -i "$CONTAINER" psql "$PSQL_URL" -X)
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
  QUERY="$(cat "$FILE")"
fi

if [[ -z "$QUERY" ]]; then
  echo "✗ No query provided. Pass a query string or -f file.sql" >&2
  exit 2
fi

QUERY="${QUERY%;}"

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
