-- AlterTable
ALTER TABLE "outreach" ADD COLUMN "did_npa_subset" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
