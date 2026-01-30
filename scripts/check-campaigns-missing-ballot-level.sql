-- Script to verify migration will succeed for tcr_compliance.office_level backfill
-- Run this BEFORE applying migration 20260126161125_add_tcr_compliance_fields

-- 1. Overview of tcr_compliance records
SELECT
  COUNT(*) as total_tcr_compliance_records
FROM tcr_compliance;

-- 2. Check for orphaned tcr_compliance records (no matching campaign)
-- These would cause the migration to FAIL because office_level would remain NULL
SELECT
  tc.id as tcr_compliance_id,
  tc.campaign_id,
  'ORPHAN - NO CAMPAIGN' as issue
FROM tcr_compliance tc
LEFT JOIN campaign c ON tc.campaign_id = c.id
WHERE c.id IS NULL;

-- 3. Preview what office_level values will be set
SELECT
  COALESCE(c.details->>'ballotLevel', 'NULL/MISSING') as ballot_level,
  CASE
    WHEN c.details->>'ballotLevel' = 'FEDERAL' THEN 'federal'
    WHEN c.details->>'ballotLevel' = 'STATE' THEN 'state'
    ELSE 'local'
  END as will_become_office_level,
  COUNT(*) as count
FROM tcr_compliance tc
JOIN campaign c ON tc.campaign_id = c.id
GROUP BY c.details->>'ballotLevel'
ORDER BY count DESC;

-- 4. Detailed view of tcr_compliance records that will be backfilled
SELECT
  tc.id as tcr_compliance_id,
  tc.campaign_id,
  c.slug as campaign_slug,
  c.details->>'ballotLevel' as current_ballot_level,
  CASE
    WHEN c.details->>'ballotLevel' = 'FEDERAL' THEN 'federal'
    WHEN c.details->>'ballotLevel' = 'STATE' THEN 'state'
    ELSE 'local'
  END as will_become_office_level
FROM tcr_compliance tc
JOIN campaign c ON tc.campaign_id = c.id
ORDER BY tc.id;

-- 5. SUMMARY: Will migration succeed?
SELECT
  CASE
    WHEN orphan_count > 0 THEN 'FAIL - ' || orphan_count || ' orphaned tcr_compliance records found'
    WHEN total_count = 0 THEN 'OK - No tcr_compliance records to backfill'
    ELSE 'OK - ' || total_count || ' records will be backfilled successfully'
  END as migration_status
FROM (
  SELECT
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE c.id IS NULL) as orphan_count
  FROM tcr_compliance tc
  LEFT JOIN campaign c ON tc.campaign_id = c.id
) counts;
