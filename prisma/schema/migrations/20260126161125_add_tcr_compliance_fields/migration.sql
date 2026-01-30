-- CreateEnum
CREATE TYPE "OfficeLevel" AS ENUM ('federal', 'state', 'local');

-- CreateEnum
CREATE TYPE "CommitteeType" AS ENUM ('house', 'senate', 'presidential', 'candidate');

-- AlterTable: Add columns (office_level nullable initially for backfill)
ALTER TABLE "tcr_compliance"
  -- Both state and local must use 'candidate' committee type. Since no federal candidates have been used in this flow, this is a safe default.
  ADD COLUMN "committee_type" "CommitteeType" NOT NULL DEFAULT 'candidate',
  ADD COLUMN "fec_committee_id" TEXT,
  ADD COLUMN "office_level" "OfficeLevel";

-- Backfill office_level from campaign.details->>'ballotLevel'
-- Maps: FEDERAL -> federal, STATE -> state, everything else (LOCAL, CITY, COUNTY, or NULL) -> local
UPDATE tcr_compliance tc
SET office_level = CASE
  WHEN c.details->>'ballotLevel' = 'FEDERAL' THEN 'federal'::"OfficeLevel"
  WHEN c.details->>'ballotLevel' = 'STATE' THEN 'state'::"OfficeLevel"
  ELSE 'local'::"OfficeLevel"
END
FROM campaign c
WHERE tc.campaign_id = c.id;

-- Make office_level required after backfill
ALTER TABLE "tcr_compliance" ALTER COLUMN "office_level" SET NOT NULL;
