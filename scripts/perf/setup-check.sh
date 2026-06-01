#!/usr/bin/env bash
# Check that the local environment can run scripts/perf/*.sh end-to-end.
# Backs up ai-rules/performance-tools.md §11.6 (Agents in fresh worktrees).
#
# Reports — does NOT install anything, does NOT start any service.
# Exits 0 always; the report is informational. Treat any ✗ as something to
# fix before claiming a measurement from the affected tool.
#
# Usage:
#   scripts/perf/setup-check.sh
#   PORT=3001 scripts/perf/setup-check.sh
#
# Env overrides:
#   PORT                  (default 3000 — the gp-api dev server port)
#   HOST                  (default localhost)
#   PG_DOCKER_CONTAINER   (default goodparty-postgres)
set -euo pipefail

PORT="${PORT:-3000}"
HOST="${HOST:-localhost}"
CONTAINER="${PG_DOCKER_CONTAINER:-goodparty-postgres}"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '2,/^set -/p' "$0" | sed 's/^# \{0,1\}//;/^set -/d'
  exit 0
fi

OK="✓"
NO="✗"
WARN="⚠"

check() {
  # $1 = label, $2 = command (eval-safe), $3 = optional remediation hint
  # Always returns 0 — the printed glyph is the result. Keeps `set -e` happy.
  local label="$1" cmd="$2" hint="${3:-}"
  if eval "$cmd" >/dev/null 2>&1; then
    printf "  %s  %s\n" "$OK" "$label"
  else
    printf "  %s  %s\n" "$NO" "$label"
    [[ -n "$hint" ]] && printf "       %s\n" "$hint"
  fi
  return 0
}

note() {
  printf "  %s  %s\n" "$WARN" "$1"
}

echo
echo "scripts/perf/ environment check"
echo "================================"
echo

echo "Tools:"
check "node $(node --version 2>/dev/null || echo '(not found)')" \
      'command -v node' \
      'Install Node 22.x via nvm / fnm / mise.'
check "autocannon (HTTP load — §1)" \
      'command -v autocannon' \
      'Falls back to: npx --yes autocannon (no install needed; first run is slow).'
check "hyperfine (statistical bench — §0)" \
      'command -v hyperfine' \
      "Install: brew install hyperfine  (mac) | cargo install hyperfine (linux)."

echo
echo "Database:"
if command -v psql >/dev/null 2>&1; then
  check "psql on PATH" 'command -v psql'
elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
  printf "  %s  docker exec %s psql (host psql not on PATH — docker fallback available)\n" "$OK" "$CONTAINER"
else
  printf "  %s  no psql AND no '%s' container running\n" "$NO" "$CONTAINER"
  case "$(uname -s)" in
    Darwin) echo "       Install: brew install libpq && brew link --force libpq" ;;
    Linux)  echo "       Install: apt install postgresql-client  (debian/ubuntu)" ;;
  esac
  echo "       Or: docker compose up -d  (per the repo's docker-compose.yml)"
fi

# DATABASE_URL resolution — same logic as explain.sh, but read-only.
DBURL="${DATABASE_URL:-}"
ENV_SRC=""
if [[ -z "$DBURL" ]]; then
  if [[ -f ./.env ]]; then
    ENV_SRC="./.env"
  elif command -v git >/dev/null 2>&1; then
    super="$(git rev-parse --show-superproject-working-tree 2>/dev/null || true)"
    if [[ -n "$super" && -f "$super/.env" ]]; then
      ENV_SRC="$super/.env"
    else
      cdir="$(git rev-parse --git-common-dir 2>/dev/null || true)"
      if [[ -n "$cdir" && -f "$(dirname "$cdir")/.env" ]]; then
        ENV_SRC="$(dirname "$cdir")/.env"
      fi
    fi
  fi
  if [[ -n "$ENV_SRC" ]]; then
    # Match explain.sh's extract_database_url() so we don't silently report
    # GREEN for a value that explain.sh would reject. Handles single/double
    # quotes and trailing inline comments.
    _raw="$(grep -E '^DATABASE_URL[[:space:]]*=' "$ENV_SRC" | head -1 || true)"
    if [[ -n "$_raw" ]]; then
      _val="${_raw#*=}"
      if [[ "$_val" == \"* ]]; then
        _val="${_val#\"}"; _val="${_val%%\"*}"
      elif [[ "$_val" == \'* ]]; then
        _val="${_val#\'}"; _val="${_val%%\'*}"
      else
        _val="${_val%%#*}"; _val="${_val%%[[:space:]]*}"
      fi
      DBURL="$_val"
    fi
  fi
fi
if [[ -n "$DBURL" ]]; then
  if [[ -n "$ENV_SRC" ]]; then
    printf "  %s  DATABASE_URL resolvable (from %s)\n" "$OK" "$ENV_SRC"
  else
    printf "  %s  DATABASE_URL resolvable (from env)\n" "$OK"
  fi
else
  printf "  %s  DATABASE_URL not found in env, ./.env, or parent worktree .env\n" "$NO"
  echo "       Set: export DATABASE_URL=postgres://..."
fi

echo
echo "App:"
if command -v curl >/dev/null 2>&1; then
  if curl -fsS -o /dev/null --max-time 2 "http://${HOST}:${PORT}/health" 2>/dev/null; then
    printf "  %s  gp-api dev server reachable at http://%s:%s/health\n" "$OK" "$HOST" "$PORT"
  else
    printf "  %s  no listener on http://%s:%s (start: npm run start:dev)\n" "$WARN" "$HOST" "$PORT"
  fi
else
  note "curl not available — skipping server reachability check"
fi

# Repo-local node_modules + ai-rules submodule (helpful in fresh worktrees).
echo
echo "Repo state:"
if [[ -d node_modules ]]; then
  printf "  %s  node_modules present\n" "$OK"
else
  printf "  %s  node_modules missing (run: npm ci)\n" "$NO"
fi

if [[ -f ai-rules/performance.md ]]; then
  printf "  %s  ai-rules/performance.md present (submodule initialized)\n" "$OK"
elif [[ -f ai-rules/README.md ]]; then
  printf "  %s  ai-rules submodule initialized but performance.md missing — submodule out of sync with the recorded pointer\n" "$WARN"
  echo "       Sync: git submodule update ai-rules"
  echo "       (Don't 'git checkout origin/main' inside the submodule — that lands at a tree that may not contain performance.md.)"
elif [[ -e ai-rules ]] || git config -f .gitmodules --get submodule.ai-rules.url >/dev/null 2>&1; then
  printf "  %s  ai-rules submodule NOT initialized\n" "$NO"
  echo "       Run: git submodule update --init --recursive"
else
  note "ai-rules submodule not present in this repo"
fi

echo
echo "Done. Anything marked ✗ above is a real blocker for the relevant tool."
echo "Anything marked ⚠ is informational — usually fine for some tools, not for others."
exit 0
