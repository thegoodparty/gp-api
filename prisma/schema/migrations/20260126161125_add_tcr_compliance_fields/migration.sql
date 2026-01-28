-- CreateEnum
CREATE TYPE "OfficeLevel" AS ENUM ('federal', 'state', 'local');

-- CreateEnum
CREATE TYPE "CommitteeType" AS ENUM ('H', 'S', 'P', 'CA');

-- AlterTable
ALTER TABLE "tcr_compliance"
  -- Both state and local must use 'CA' (Candidate) committee type. Since no federal candidates have been used in this flow, this is a safe default.
  ADD COLUMN "committee_type" "CommitteeType" DEFAULT 'CA',
  ADD COLUMN "fec_committee_id" TEXT,
  ADD COLUMN "office_level" "OfficeLevel";
