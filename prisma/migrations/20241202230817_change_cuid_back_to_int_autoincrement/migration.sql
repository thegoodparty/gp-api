/*
  Warnings:

  - The primary key for the `campaign_position` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `campaign_position` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `topIssueId` column on the `campaign_position` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `position` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `position` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `topIssueId` column on the `position` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `top_issue` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `top_issue` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `B` on the `_CampaignToTopIssue` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `positionId` on the `campaign_position` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "_CampaignToTopIssue" DROP CONSTRAINT "_CampaignToTopIssue_B_fkey";

-- DropForeignKey
ALTER TABLE "campaign_position" DROP CONSTRAINT "campaign_position_positionId_fkey";

-- DropForeignKey
ALTER TABLE "campaign_position" DROP CONSTRAINT "campaign_position_topIssueId_fkey";

-- DropForeignKey
ALTER TABLE "position" DROP CONSTRAINT "position_topIssueId_fkey";

-- AlterTable
ALTER TABLE "_CampaignToTopIssue" DROP COLUMN "B",
ADD COLUMN     "B" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "campaign_position" DROP CONSTRAINT "campaign_position_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "positionId",
ADD COLUMN     "positionId" INTEGER NOT NULL,
DROP COLUMN "topIssueId",
ADD COLUMN     "topIssueId" INTEGER,
ADD CONSTRAINT "campaign_position_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "position" DROP CONSTRAINT "position_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "topIssueId",
ADD COLUMN     "topIssueId" INTEGER,
ADD CONSTRAINT "position_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "top_issue" DROP CONSTRAINT "top_issue_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "top_issue_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "_CampaignToTopIssue_AB_unique" ON "_CampaignToTopIssue"("A", "B");

-- CreateIndex
CREATE INDEX "_CampaignToTopIssue_B_index" ON "_CampaignToTopIssue"("B");

-- CreateIndex
CREATE INDEX "campaign_position_positionId_idx" ON "campaign_position"("positionId");

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_topIssueId_fkey" FOREIGN KEY ("topIssueId") REFERENCES "top_issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_position" ADD CONSTRAINT "campaign_position_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_position" ADD CONSTRAINT "campaign_position_topIssueId_fkey" FOREIGN KEY ("topIssueId") REFERENCES "top_issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CampaignToTopIssue" ADD CONSTRAINT "_CampaignToTopIssue_B_fkey" FOREIGN KEY ("B") REFERENCES "top_issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
