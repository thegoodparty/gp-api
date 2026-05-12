#!/usr/bin/env python3
"""find-orphan-outreach.py — flag charged-but-not-delivered outreach.

Scans gp-api prod CloudWatch logs for successful TEXT-purchase Stripe webhooks,
then queries the prod read-only DB for matching outreach rows. A webhook with
no matching row inside the window is an orphan: the customer was charged but
no outreach was scheduled.

Requires:
  - AWS profile `feliks-gp-engineer-2` with a valid SSO session
    (run `aws --profile feliks-gp-engineer-2 sso login` if expired)
  - `DATABASE_URL_PROD_READONLY` in env or in `gp-api/.env`
  - `node` on PATH (uses `pg` from gp-api/node_modules — no psql needed)

Usage:
  python3 scripts/find-orphan-outreach.py --days 7
  python3 scripts/find-orphan-outreach.py --start 2026-04-15 --end 2026-05-12
  python3 scripts/find-orphan-outreach.py --window-minutes 15 --verbose

Notes:
  - Uses CloudWatch Logs Insights (indexed, fast) — not filter-log-events.
  - CloudWatch retention is ~30 days. Larger --days values silently return less.
  - Match window default: webhook_ts − 2 min … webhook_ts + 10 min.
"""
import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

LOG_GROUP = "/sst/cluster/gp-master-fargateCluster/gp-api-master/gp-api-master"
AWS_PROFILE = "feliks-gp-engineer-2"
AWS_REGION = "us-west-2"

INSIGHTS_QUERY = """
fields @timestamp, @message
| filter @message like /Processing one-time payment checkout session completion/
| filter @message like /TEXT/
| sort @timestamp asc
| limit 10000
"""


def aws_check_sso() -> None:
    """Fail fast if SSO is expired."""
    result = subprocess.run(
        ["aws", "--profile", AWS_PROFILE, "sts", "get-caller-identity", "--output", "json"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit(
            "AWS SSO is not active for profile feliks-gp-engineer-2.\n"
            "Run: aws --profile feliks-gp-engineer-2 sso login"
        )


def load_db_url() -> str:
    url = os.environ.get("DATABASE_URL_PROD_READONLY")
    if url:
        return url
    candidates = [
        Path(__file__).resolve().parent.parent / ".env",
        Path.home() / "projects" / "gp-api" / ".env",
        Path.cwd() / ".env",
    ]
    for env_path in candidates:
        if not env_path.exists():
            continue
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL_PROD_READONLY"):
                _, _, val = line.partition("=")
                return val.strip().strip('"').strip("'")
    sys.exit(
        "DATABASE_URL_PROD_READONLY not found in env or .env. "
        "Export it or run from gp-api/."
    )


def insights_query(start_ms: int, end_ms: int, query: str) -> list:
    """Start a Logs Insights query, poll until complete, return rows."""
    start = subprocess.run(
        [
            "aws", "--profile", AWS_PROFILE, "--region", AWS_REGION,
            "logs", "start-query",
            "--log-group-name", LOG_GROUP,
            "--start-time", str(start_ms // 1000),
            "--end-time", str(end_ms // 1000),
            "--query-string", query,
            "--limit", "10000",
            "--output", "json",
        ],
        capture_output=True, text=True, check=True,
    )
    query_id = json.loads(start.stdout)["queryId"]

    while True:
        res = subprocess.run(
            [
                "aws", "--profile", AWS_PROFILE, "--region", AWS_REGION,
                "logs", "get-query-results",
                "--query-id", query_id,
                "--output", "json",
            ],
            capture_output=True, text=True, check=True,
        )
        data = json.loads(res.stdout)
        status = data.get("status")
        print(f"  Insights status: {status} ({len(data.get('results', []))} rows so far)", file=sys.stderr)
        if status == "Complete":
            return data.get("results", [])
        if status in ("Failed", "Cancelled", "Timeout"):
            sys.exit(f"Insights query ended in status {status}")
        time.sleep(2)


def parse_webhooks(rows: list) -> list:
    """Insights rows → webhook dicts."""
    webhooks = []
    for row in rows:
        fields = {f["field"]: f["value"] for f in row}
        message = fields.get("@message", "")
        try:
            msg = json.loads(message)
        except json.JSONDecodeError:
            continue
        if msg.get("purchaseType") != "TEXT":
            continue
        # @timestamp is "YYYY-MM-DD HH:MM:SS.fff" UTC
        ts_str = fields.get("@timestamp", "")
        try:
            dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S.%f").replace(tzinfo=timezone.utc)
            ts_ms = int(dt.timestamp() * 1000)
        except ValueError:
            ts_ms = msg.get("time", 0)
        webhooks.append({
            "ts_ms": ts_ms,
            "userId": str(msg.get("userId", "")),
            "sessionId": msg.get("sessionId", ""),
            "requestId": msg.get("requestId", ""),
        })
    return webhooks


GP_API_DIR = str(Path(__file__).resolve().parent.parent)


def fetch_users(db_url: str, user_ids: list) -> dict:
    """For a list of numeric user IDs, return {id: {email, first_name, last_name, customer_id}}."""
    if not user_ids:
        return {}
    js = r"""
const { Client } = require(process.env.GP_API_DIR + '/node_modules/pg');
(async () => {
  const client = new Client({ connectionString: process.env.DB_URL });
  await client.connect();
  const ids = JSON.parse(process.env.USER_IDS);
  const res = await client.query(
    `SELECT id, email, first_name, last_name, meta_data->>'customerId' AS customer_id
     FROM "user" WHERE id = ANY($1::int[])`,
    [ids],
  );
  process.stdout.write(JSON.stringify(res.rows));
  await client.end();
})().catch(e => { console.error(e.message || e); process.exit(1); });
"""
    env = {
        **os.environ,
        "GP_API_DIR": GP_API_DIR,
        "DB_URL": db_url,
        "USER_IDS": json.dumps([int(u) for u in user_ids]),
    }
    result = subprocess.run(["node", "-e", js], env=env, capture_output=True, text=True, check=True)
    rows = json.loads(result.stdout)
    return {str(r["id"]): r for r in rows}


def fetch_p2p_outreach_rows(db_url: str, start_iso: str, end_iso: str) -> list:
    """Run the query via Node + pg (gp-api/node_modules). Avoids requiring psql."""
    js = r"""
const { Client } = require(process.env.GP_API_DIR + '/node_modules/pg');
(async () => {
  const client = new Client({ connectionString: process.env.DB_URL });
  await client.connect();
  const res = await client.query(
    `SELECT
       o.id,
       (EXTRACT(EPOCH FROM o."createdAt") * 1000)::bigint AS created_ms,
       c.user_id
     FROM outreach o
     JOIN campaign c ON c.id = o."campaignId"
     WHERE o."createdAt" >= $1
       AND o."createdAt" < $2
       AND o.outreach_type = 'p2p';`,
    [process.env.START_ISO, process.env.END_ISO],
  );
  process.stdout.write(JSON.stringify(res.rows));
  await client.end();
})().catch(e => { console.error(e.message || e); process.exit(1); });
"""
    env = {
        **os.environ,
        "GP_API_DIR": GP_API_DIR,
        "DB_URL": db_url,
        "START_ISO": start_iso,
        "END_ISO": end_iso,
    }
    result = subprocess.run(
        ["node", "-e", js],
        env=env, capture_output=True, text=True, check=True,
    )
    try:
        rows_data = json.loads(result.stdout)
    except json.JSONDecodeError:
        sys.exit(f"Node returned unparsable output: {result.stdout[:200]}\n{result.stderr[:500]}")
    rows = []
    for r in rows_data:
        try:
            rows.append({
                "id": int(r["id"]),
                "created_ms": int(r["created_ms"]),
                "user_id": str(r["user_id"]),
            })
        except (KeyError, ValueError, TypeError):
            continue
    return rows


def fmt_ts(ts_ms: int) -> str:
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime(
        "%Y-%m-%d %H:%M:%S UTC"
    )


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    g = p.add_mutually_exclusive_group()
    g.add_argument("--days", type=int, default=7, help="Days back from now (default 7)")
    g.add_argument("--start", help="Start date YYYY-MM-DD (UTC)")
    p.add_argument("--end", help="End date YYYY-MM-DD; default: now")
    p.add_argument("--window-minutes", type=int, default=10,
                   help="Window after webhook to look for an outreach row (default 10)")
    p.add_argument("--lookback-minutes", type=int, default=2,
                   help="Look this far before the webhook too, for clock skew (default 2)")
    p.add_argument("--verbose", action="store_true")
    args = p.parse_args()

    end = (datetime.strptime(args.end, "%Y-%m-%d").replace(tzinfo=timezone.utc)
           if args.end else datetime.now(timezone.utc))
    start = (datetime.strptime(args.start, "%Y-%m-%d").replace(tzinfo=timezone.utc)
             if args.start else end - timedelta(days=args.days))

    start_ms = int(start.timestamp() * 1000)
    end_ms = int(end.timestamp() * 1000)
    window_ms = args.window_minutes * 60 * 1000
    lookback_ms = args.lookback_minutes * 60 * 1000

    print(f"Scanning {fmt_ts(start_ms)} → {fmt_ts(end_ms)}", file=sys.stderr)
    print(f"Match window: −{args.lookback_minutes}m … +{args.window_minutes}m", file=sys.stderr)

    print("Checking AWS SSO…", file=sys.stderr)
    aws_check_sso()

    db_url = load_db_url()

    print("Running CloudWatch Logs Insights query for TEXT webhooks…", file=sys.stderr)
    rows = insights_query(start_ms, end_ms, INSIGHTS_QUERY)
    webhooks = parse_webhooks(rows)
    print(f"  → {len(webhooks)} TEXT-purchase webhooks", file=sys.stderr)

    if not webhooks:
        print("No webhooks in this window. Nothing to check.")
        return

    print("Fetching p2p outreach rows from prod DB…", file=sys.stderr)
    db_start = (start - timedelta(minutes=args.lookback_minutes)).isoformat()
    db_end = (end + timedelta(minutes=args.window_minutes)).isoformat()
    rows = fetch_p2p_outreach_rows(db_url, db_start, db_end)
    print(f"  → {len(rows)} p2p outreach rows", file=sys.stderr)

    rows_by_user: dict = {}
    for r in rows:
        rows_by_user.setdefault(r["user_id"], []).append(r)

    orphans = []
    matched = 0
    for wh in webhooks:
        candidates = rows_by_user.get(wh["userId"], [])
        in_window = [
            r for r in candidates
            if wh["ts_ms"] - lookback_ms <= r["created_ms"] <= wh["ts_ms"] + window_ms
        ]
        if in_window:
            matched += 1
            if args.verbose:
                print(
                    f"  OK   {fmt_ts(wh['ts_ms'])}  user={wh['userId']:>8}  outreach={in_window[0]['id']}",
                    file=sys.stderr,
                )
        else:
            orphans.append(wh)
            if args.verbose:
                print(
                    f"  ORPH {fmt_ts(wh['ts_ms'])}  user={wh['userId']:>8}  session={wh['sessionId'][:30]}",
                    file=sys.stderr,
                )

    print()
    print("=== Results ===")
    print(f"Webhooks scanned:           {len(webhooks)}")
    print(f"Matched to outreach row:    {matched}")
    print(f"Orphans (no row in window): {len(orphans)}")
    print()
    if orphans:
        users = fetch_users(db_url, list({o["userId"] for o in orphans}))
        print(f"{'Time (UTC)':22s} | {'User':>6} | {'Email':30s} | {'Stripe customer':22s} | Session")
        print("-" * 160)
        for o in sorted(orphans, key=lambda x: x["ts_ms"]):
            u = users.get(o["userId"], {})
            email = (u.get("email") or "")[:30]
            cust = (u.get("customer_id") or "")[:22]
            print(f"{fmt_ts(o['ts_ms']):22s} | {o['userId']:>6} | {email:30s} | {cust:22s} | {o['sessionId']}")
        print()
        print("In Stripe Dashboard, look up the Stripe customer ID above to see the unmatched charge.")
        print("Customer ID page format: https://dashboard.stripe.com/customers/<cus_id>")


if __name__ == "__main__":
    main()
