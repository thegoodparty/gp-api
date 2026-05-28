#!/usr/bin/env bash
# Quick HTTP benchmark using autocannon.
# Backs up ai-rules/performance-tools.md §1.
#
# Usage:
#   scripts/perf/bench-endpoint.sh /health
#   scripts/perf/bench-endpoint.sh -c 50 -d 60 /v1/things
#   scripts/perf/bench-endpoint.sh -m POST \
#       -H 'content-type: application/json' \
#       -b '{"x":1}' /v1/things
#   PORT=3001 HOST=127.0.0.1 scripts/perf/bench-endpoint.sh /health
#
# Env overrides:
#   PORT   (default 3000)
#   HOST   (default localhost)
#   PROTO  (default http)
#
# Any extra flags are passed through to autocannon.
# If no -c / -d are passed, defaults are 10 connections and 20 seconds.
set -euo pipefail

PORT="${PORT:-3000}"
HOST="${HOST:-localhost}"
PROTO="${PROTO:-http}"

if [[ $# -eq 0 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '2,/^set -/p' "$0" | sed 's/^# \{0,1\}//;/^set -/d'
  [[ $# -eq 0 ]] && exit 2 || exit 0
fi

if ! command -v autocannon >/dev/null 2>&1; then
  echo "✗ autocannon not found. Install: npm i -g autocannon" >&2
  exit 1
fi

ARGS=("$@")
HAS_C=false; HAS_D=false
for a in "${ARGS[@]}"; do
  case "$a" in
    -c|--connections) HAS_C=true ;;
    -d|--duration)    HAS_D=true ;;
  esac
done
$HAS_C || ARGS=(-c 10 "${ARGS[@]}")
$HAS_D || ARGS=(-d 20 "${ARGS[@]}")

LAST_IDX=$(( ${#ARGS[@]} - 1 ))
TARGET="${ARGS[$LAST_IDX]}"
unset 'ARGS[$LAST_IDX]'

if [[ "$TARGET" =~ ^https?:// ]]; then
  URL="$TARGET"
else
  URL="${PROTO}://${HOST}:${PORT}${TARGET}"
fi

echo "→ autocannon ${ARGS[*]} $URL"
exec autocannon "${ARGS[@]}" "$URL"
