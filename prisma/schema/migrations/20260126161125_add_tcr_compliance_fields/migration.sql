-- CreateEnum
CREATE TYPE "OfficeLevel" AS ENUM ('federal', 'state', 'local');

-- CreateEnum
CREATE TYPE "CommitteeType" AS ENUM ('H', 'S', 'P', 'CA');

-- AlterTable
ALTER TABLE "tcr_compliance"
  -- Both state and local must use 'CA' (Candidate) committee type. Since no federal candidates have been used in this flow, this is a safe default.
  ADD COLUMN "committee_type" "CommitteeType" DEFAULT 'CA',
  ADD COLUMN "fec_committee_id" TEXT,
  -- We can't set a default because we're unable to tell which are state vs local. 
  ADD COLUMN "officeLevel" "OfficeLevel";
