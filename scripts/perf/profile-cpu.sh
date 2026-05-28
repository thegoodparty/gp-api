#!/usr/bin/env bash
# CPU profile a Node command via the V8 built-in sampler.
# Backs up ai-rules/performance-tools.md §3.
#
# Usage:
#   scripts/perf/profile-cpu.sh -- npm run start:prod
#   scripts/perf/profile-cpu.sh -- node dist/main.js
#   scripts/perf/profile-cpu.sh -- npx tsx scripts/some-job.ts
#
# Writes one or more .cpuprofile files to ./profiles/ (one per child process).
# Stop a long-running server with ^C; one-shot scripts will exit on their own.
#
# After exit:
#   - Open in Chrome DevTools: Performance tab → "Load profile…"
#   - Or generate a flame graph: npx flamebearer < profiles/CPU.*.cpuprofile
set -euo pipefail

DIR="${PROFILE_DIR:-./profiles}"
mkdir -p "$DIR"

if [[ "${1:-}" == "--" ]]; then
  shift
fi

if [[ $# -eq 0 ]]; then
  echo "usage: $0 -- <command> [args...]" >&2
  echo "  e.g. $0 -- npm run start:prod" >&2
  echo "  e.g. $0 -- node dist/main.js" >&2
  exit 2
fi

NODE_FLAGS="--cpu-prof --cpu-prof-dir=$DIR"

echo "→ Profiling: $*"
echo "  Profile dir: $DIR"
echo "  (NODE_OPTIONS injected for child processes)"
echo "  Stop a server with ^C; scripts exit on their own."
echo

export NODE_OPTIONS="${NODE_OPTIONS:-} $NODE_FLAGS"
exec "$@"
