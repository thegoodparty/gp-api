# scripts/perf/

Performance tooling wrappers. Convenience scripts behind the canonical commands in [`ai-rules/performance-tools.md`](../../ai-rules/performance-tools.md).

| Script | What it does | Cookbook section |
|---|---|---|
| `bench-endpoint.sh` | Single-endpoint HTTP load test (autocannon) | §1 |
| `profile-cpu.sh` | V8 CPU profile of any node command (writes `.cpuprofile`) | §3 |
| `explain.sh` | `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` against the configured DB | §5 |

## Prereqs

```bash
brew install hyperfine libpq           # libpq gives you psql
npm i -g autocannon                    # or run via npx autocannon
```

## Examples

```bash
# Quick health check load (defaults: 10 connections, 20s)
scripts/perf/bench-endpoint.sh /health

# Heavier load, with auth, against a specific port
PORT=3001 scripts/perf/bench-endpoint.sh \
  -c 50 -d 60 \
  -H 'authorization: Bearer dev-token' \
  /v1/things

# Compare two branches end-to-end with hyperfine
hyperfine --warmup 1 --runs 5 \
  'git checkout main && scripts/perf/bench-endpoint.sh -c 10 -d 10 /v1/things | tail -1' \
  'git checkout my-branch && scripts/perf/bench-endpoint.sh -c 10 -d 10 /v1/things | tail -1'

# Profile a one-off script (exits naturally)
scripts/perf/profile-cpu.sh -- npx tsx scripts/some-job.ts

# Profile a long-running server (^C when done collecting)
scripts/perf/profile-cpu.sh -- npm run start:prod
# In another terminal:
scripts/perf/bench-endpoint.sh -c 20 -d 30 /v1/things
# Then ^C the server; open the .cpuprofile in Chrome DevTools (Performance > Load profile)
# or run: npx flamebearer < profiles/CPU.*.cpuprofile

# EXPLAIN a slow query
scripts/perf/explain.sh 'SELECT * FROM "User" WHERE "email" = '\''x@y.com'\'''
scripts/perf/explain.sh -f scripts/perf/slow.sql
```

See the cookbook for the full menu of tools (k6, microbenchmarks, Lighthouse, bundle analysis, GC tracing, heap profiles, production telemetry).

## Critic tie-in

Per the [performance critic rules](../../ai-rules/performance.md), any PR that claims a performance improvement should include before/after numbers from one of these tools (or production telemetry). Without a measurement, the change is a refactor.
