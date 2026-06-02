#!/usr/bin/env bash
# CPU profile a Node command via the V8 built-in sampler.
# Backs up ai-rules/performance-tools.md §3.
#
# Requires: a direct `node` (or `tsx`/`npx tsx`) invocation of the workload —
# NOT `npm run`, `nest start`, `next start`, or anything else that re-execs
# node through a wrapper. Node 18+ rejects `--cpu-prof` in NODE_OPTIONS, which
# is why this script does NOT inject it that way.
#
# Usage:
#   scripts/perf/profile-cpu.sh -- node dist/main.js
#   scripts/perf/profile-cpu.sh -- tsx scripts/some-job.ts
#   scripts/perf/profile-cpu.sh -- npx tsx scripts/some-job.ts
#
# What about npm-script or nest-start targets?
#   - Profile the underlying built JS file directly:
#       scripts/perf/profile-cpu.sh -- node dist/main.js
#   - OR add a temporary script in package.json and run that:
#       "start:prod:profile": "node --cpu-prof --cpu-prof-dir=./profiles dist/main.js"
#       npm run start:prod:profile
#
# Writes one or more .cpuprofile files to $PROFILE_DIR (default ./profiles).
# Stop a long-running server with ^C; one-shot scripts will exit on their own.
#
# After exit:
#   - Open in Chrome DevTools: Performance tab → "Load profile…"
#   - Or generate a flame graph: npx flamebearer < profiles/CPU.*.cpuprofile
set -euo pipefail

DIR="${PROFILE_DIR:-./profiles}"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '2,/^set -/p' "$0" | sed 's/^# \{0,1\}//;/^set -/d'
  exit 0
fi

if [[ "${1:-}" == "--" ]]; then
  shift
fi

if [[ $# -eq 0 ]]; then
  echo "usage: $0 -- <command> [args...]" >&2
  echo "  e.g. $0 -- node dist/main.js" >&2
  echo "       $0 -- tsx scripts/some-job.ts" >&2
  echo "  run with --help for full notes." >&2
  exit 2
fi

CMD="$1"
shift

case "$(basename "$CMD")" in
  npm|pnpm|yarn|nest|next)
    cat >&2 <<EOF
✗ '$CMD' is an indirect entrypoint. Node 18+ rejects --cpu-prof when set via
  NODE_OPTIONS, so this script cannot wrap '$CMD' transparently. Pick one:

    1. Profile the built JS directly:
         $0 -- node dist/main.js

    2. Add a one-off profiling script in package.json:
         "start:prod:profile": "node --cpu-prof --cpu-prof-dir=$DIR dist/main.js"
       then run:
         npm run start:prod:profile

  See ai-rules/performance-tools.md §3b for details.
EOF
    exit 2
    ;;
esac

mkdir -p "$DIR"
NODE_FLAGS=(--cpu-prof "--cpu-prof-dir=$DIR")

# `node --import tsx` requires tsx in node_modules; the global `tsx` binary
# (or `npx tsx`) doesn't satisfy that. Fail fast with an actionable message
# instead of letting node throw `ERR_MODULE_NOT_FOUND: Cannot find package 'tsx'`.
require_local_tsx() {
  if ! node -e "require.resolve('tsx')" >/dev/null 2>&1; then
    echo "✗ This script translates '$1' to 'node --import tsx', which needs tsx in node_modules." >&2
    echo "  tsx is NOT installed locally in this project." >&2
    echo "  Either install it:    npm install --save-dev tsx" >&2
    echo "  Or profile node directly: $0 -- node dist/<your-built-script>.js" >&2
    exit 2
  fi
}

# Echo the user's command shape without exposing the full argv. The
# script path (first arg) is shown — it's never a secret — but everything
# after is replaced with `<args>` to keep API keys, DB URLs, tokens,
# etc. out of stdout / CI logs / shell history. The exec() below still
# passes the unmodified "$@", so the program receives its real args.
display_cmd_tail() {
  # $1 = script path (or empty); rest = args. Echoes "script [N more args]".
  local script="${1:-}"
  shift || true
  if [[ -z "$script" ]]; then
    return
  elif [[ $# -eq 0 ]]; then
    echo -n "$script"
  else
    echo -n "$script <args>"
  fi
}

# Without these guards, `profile-cpu.sh -- node` (or `-- tsx`, `-- npx tsx`)
# with no following script argument would `exec node …` with no script,
# silently launching an interactive REPL — no .cpuprofile written, no
# error printed, the process just hangs at a Node prompt. The outer
# `$# -eq 0` check on a fully-empty invocation fires before $CMD is
# consumed, so it doesn't cover these cases.
case "$(basename "$CMD")" in
  node)
    if [[ $# -eq 0 ]]; then
      echo "✗ Missing script argument for 'node'." >&2
      echo "  Usage: $0 -- node <script-or-dist-entry> [args...]" >&2
      echo "  Example: $0 -- node dist/main.js" >&2
      exit 2
    fi
    echo "→ node ${NODE_FLAGS[*]} $(display_cmd_tail "$@")"
    echo "  Stop with ^C; one-shot scripts exit on their own."
    echo "  Profile dir: $DIR"
    echo
    exec node "${NODE_FLAGS[@]}" "$@"
    ;;

  tsx)
    # Translate `tsx script.ts ...` → `node --cpu-prof ... --import tsx script.ts ...`
    if [[ $# -eq 0 ]]; then
      echo "✗ Missing script argument for 'tsx'." >&2
      echo "  Usage: $0 -- tsx <script.ts> [args...]" >&2
      exit 2
    fi
    require_local_tsx "tsx"
    echo "→ node ${NODE_FLAGS[*]} --import tsx $(display_cmd_tail "$@")"
    echo "  Profile dir: $DIR"
    echo
    exec node "${NODE_FLAGS[@]}" --import tsx "$@"
    ;;

  npx)
    # Common pattern: `npx tsx script.ts ...` — translate same as above.
    if [[ "${1:-}" == "tsx" ]]; then
      shift
      if [[ $# -eq 0 ]]; then
        echo "✗ Missing script argument for 'npx tsx'." >&2
        echo "  Usage: $0 -- npx tsx <script.ts> [args...]" >&2
        exit 2
      fi
      require_local_tsx "npx tsx"
      echo "→ node ${NODE_FLAGS[*]} --import tsx $(display_cmd_tail "$@")  (translated from 'npx tsx')"
      echo "  Profile dir: $DIR"
      echo
      exec node "${NODE_FLAGS[@]}" --import tsx "$@"
    fi
    # Only show the tool name (first arg), not its args.
    echo "✗ Unsupported: 'npx ${1:-<empty>} …'. This script only auto-translates 'npx tsx <script>'." >&2
    echo "  For other 'npx <tool>' targets, invoke node directly:" >&2
    echo "    $0 -- node <path-to-the-tool's-bin> <args>" >&2
    exit 2
    ;;

  *)
    echo "✗ Unsupported entrypoint: '$CMD'." >&2
    echo "  Supported: node | tsx | npx tsx" >&2
    echo "  See '$0 --help' for how to profile npm-script / nest-start targets." >&2
    exit 2
    ;;
esac
