/*
  Warnings:

  - Made the column `organization_slug` on table `campaign` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organization_slug` on table `elected_office` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organization_slug` on table `voter_file_filter` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "campaign" ALTER COLUMN "organization_slug" SET NOT NULL;

-- AlterTable
ALTER TABLE "elected_office" ALTER COLUMN "organization_slug" SET NOT NULL;

-- AlterTable
ALTER TABLE "voter_file_filter" ALTER COLUMN "organization_slug" SET NOT NULL;
