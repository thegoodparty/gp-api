-- Script to analyze campaigns missing ballotLevel

-- 1. Overview
SELECT
  COUNT(*) as total_campaigns,
  COUNT(c.details->>'ballotLevel') as has_ballot_level,
  COUNT(*) - COUNT(c.details->>'ballotLevel') as missing_ballot_level
FROM campaign c;

-- 2. Breakdown of ballotLevel values
SELECT
  COALESCE(c.details->>'ballotLevel', 'NULL') as ballot_level,
  COUNT(*) as count
FROM campaign c
GROUP BY c.details->>'ballotLevel'
ORDER BY count DESC;

-- 3. Sample of campaigns missing ballotLevel (most recent 20)
SELECT
  c.id,
  c.slug,
  c.details->>'ballotLevel' as ballot_level,
  c.created_at
FROM campaign c
WHERE c.details->>'ballotLevel' IS NULL
ORDER BY c.created_at DESC
LIMIT 20;
