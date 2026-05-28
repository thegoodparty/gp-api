#!/usr/bin/env bash
# Run EXPLAIN (ANALYZE, BUFFERS, VERBOSE) on a SQL query using DATABASE_URL.
# Backs up ai-rules/performance-tools.md §5.
#
# Usage:
#   scripts/perf/explain.sh 'SELECT * FROM "User" WHERE "email" = '\''x@y.com'\'''
#   scripts/perf/explain.sh -f path/to/query.sql
#   scripts/perf/explain.sh --format JSON 'SELECT 1'
#   DATABASE_URL=postgres://... scripts/perf/explain.sh '...'
#
# Reads DATABASE_URL from the environment, or extracts it from ./.env if present.
# WARNING: EXPLAIN ANALYZE *executes* the query. Don't run UPDATE / DELETE
# without wrapping in BEGIN; ROLLBACK; (psql -1 isn't enough on its own here).
set -euo pipefail

FORMAT="TEXT"
QUERY=""
FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --format) FORMAT="$2"; shift 2 ;;
    -f|--file) FILE="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^set -/p' "$0" | sed 's/^# \{0,1\}//;/^set -/d'
      exit 0 ;;
    *) QUERY="$1"; shift ;;
  esac
done

if [[ -z "${DATABASE_URL:-}" && -f ./.env ]]; then
  # Extract DATABASE_URL without sourcing the whole .env (avoids $-expansion of secrets).
  line="$(grep -E '^DATABASE_URL[[:space:]]*=' ./.env | head -1 || true)"
  if [[ -n "$line" ]]; then
    val="${line#*=}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    export DATABASE_URL="$val"
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "✗ DATABASE_URL is not set (no ./.env either)." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "✗ psql not found. Install: brew install libpq && brew link --force libpq" >&2
  exit 1
fi

if [[ -n "$FILE" ]]; then
  QUERY="$(cat "$FILE")"
fi

if [[ -z "$QUERY" ]]; then
  echo "✗ No query provided. Pass a query string or -f file.sql" >&2
  exit 2
fi

QUERY="${QUERY%;}"
EXPLAIN="EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT $FORMAT) $QUERY;"

echo "→ EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT $FORMAT) <query>"
echo
exec psql "$DATABASE_URL" -X -c "$EXPLAIN"
