/**
 * Hunts S3 for a schedule artifact produced by the agent for a given run.
 *
 * The dev pmf-engine writes outputs to a `gp-agent-artifacts-*` bucket and
 * the key path typically includes the run id. This script lists candidate
 * objects so we can hand-wire the experiment_run row to the artifact.
 *
 * Usage:
 *   npx tsx scripts/find-schedule-artifact.ts <runId|orgSlug> [bucket]
 *
 * Bucket defaults to gp-agent-artifacts-dev.
 */

import 'dotenv/config'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'

const needle = process.argv[2]
if (!needle) {
  console.error('Usage: npx tsx scripts/find-schedule-artifact.ts <runId|orgSlug> [bucket]')
  process.exit(1)
}
const bucket = process.argv[3] ?? 'gp-agent-artifacts-dev'

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-west-2' })

const main = async () => {
  // We don't know the prefix shape — try a few common ones and fall back
  // to a bucket-wide list filtered by needle.
  const candidatePrefixes = [
    `${needle}/`,
    `meeting_schedule/${needle}/`,
    `runs/${needle}/`,
    '',
  ]

  for (const prefix of candidatePrefixes) {
    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 50,
    })
    let resp
    try {
      resp = await s3.send(cmd)
    } catch (err) {
      console.error(
        `list failed on prefix='${prefix}':`,
        err instanceof Error ? err.message : err,
      )
      continue
    }
    const matches = (resp.Contents ?? []).filter((o) =>
      o.Key ? o.Key.includes(needle) : false,
    )
    if (matches.length === 0) {
      console.log(`prefix='${prefix}': 0 matches`)
      continue
    }
    console.log(`\nprefix='${prefix}': ${matches.length} match(es)`)
    for (const obj of matches) {
      console.log(
        `  s3://${bucket}/${obj.Key}  size=${obj.Size}  lastModified=${obj.LastModified?.toISOString()}`,
      )
    }
    // First prefix that yields matches is the answer; stop.
    return
  }

  console.log(`\nNo matches for '${needle}' in s3://${bucket}/`)
  console.log('Try a different bucket as the 2nd arg, e.g.:')
  console.log(
    '  npx tsx scripts/find-schedule-artifact.ts ' +
      needle +
      ' gp-agent-artifacts-qa',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
