/*
  Warnings:

  - You are about to drop the column `campaign_id` on the `voter_file_filter` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "voter_file_filter" DROP CONSTRAINT "voter_file_filter_campaign_id_fkey";

-- DropIndex
DROP INDEX "voter_file_filter_campaign_id_idx";

-- DropIndex
DROP INDEX "voter_file_filter_id_campaign_id_idx";

-- AlterTable
ALTER TABLE "voter_file_filter" DROP COLUMN "campaign_id";
