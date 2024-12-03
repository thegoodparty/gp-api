/*
  Warnings:

  - You are about to drop the column `campaignId` on the `campaign_position` table. All the data in the column will be lost.
  - You are about to drop the column `positionId` on the `campaign_position` table. All the data in the column will be lost.
  - You are about to drop the column `topIssueId` on the `campaign_position` table. All the data in the column will be lost.
  - You are about to drop the column `topIssueId` on the `position` table. All the data in the column will be lost.
  - Added the required column `campaign_id` to the `campaign_position` table without a default value. This is not possible if the table is not empty.
  - Added the required column `position_id` to the `campaign_position` table without a default value. This is not possible if the table is not empty.
  - Added the required column `zip` to the `user` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "campaign_position" DROP CONSTRAINT "campaign_position_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "campaign_position" DROP CONSTRAINT "campaign_position_positionId_fkey";

-- DropForeignKey
ALTER TABLE "campaign_position" DROP CONSTRAINT "campaign_position_topIssueId_fkey";

-- DropForeignKey
ALTER TABLE "position" DROP CONSTRAINT "position_topIssueId_fkey";

-- DropIndex
DROP INDEX "campaign_position_campaignId_idx";

-- DropIndex
DROP INDEX "campaign_position_positionId_idx";

-- AlterTable
ALTER TABLE "campaign_position" DROP COLUMN "campaignId",
DROP COLUMN "positionId",
DROP COLUMN "topIssueId",
ADD COLUMN     "campaign_id" INTEGER NOT NULL,
ADD COLUMN     "position_id" INTEGER NOT NULL,
ADD COLUMN     "top_issue_id" INTEGER;

-- AlterTable
ALTER TABLE "position" DROP COLUMN "topIssueId",
ADD COLUMN     "top_issue_id" INTEGER;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "role" TEXT,
ADD COLUMN     "zip" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "campaign_position_campaign_id_idx" ON "campaign_position"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_position_position_id_idx" ON "campaign_position"("position_id");

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_top_issue_id_fkey" FOREIGN KEY ("top_issue_id") REFERENCES "top_issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_position" ADD CONSTRAINT "campaign_position_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_position" ADD CONSTRAINT "campaign_position_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_position" ADD CONSTRAINT "campaign_position_top_issue_id_fkey" FOREIGN KEY ("top_issue_id") REFERENCES "top_issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
