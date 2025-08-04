/*
  Warnings:

  - The primary key for the `campaign_position` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `position` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `top_issue` table will be changed. If it partially fails, the table could be left without primary key constraint.

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
ALTER TABLE "_CampaignToTopIssue" ALTER COLUMN "B" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "campaign_position" DROP CONSTRAINT "campaign_position_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "positionId" SET DATA TYPE TEXT,
ALTER COLUMN "topIssueId" SET DATA TYPE TEXT,
ADD CONSTRAINT "campaign_position_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "campaign_position_id_seq";

-- AlterTable
ALTER TABLE "position" DROP CONSTRAINT "position_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "topIssueId" SET DATA TYPE TEXT,
ADD CONSTRAINT "position_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "position_id_seq";

-- AlterTable
ALTER TABLE "top_issue" DROP CONSTRAINT "top_issue_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "top_issue_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "top_issue_id_seq";

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_topIssueId_fkey" FOREIGN KEY ("topIssueId") REFERENCES "top_issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_position" ADD CONSTRAINT "campaign_position_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_position" ADD CONSTRAINT "campaign_position_topIssueId_fkey" FOREIGN KEY ("topIssueId") REFERENCES "top_issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CampaignToTopIssue" ADD CONSTRAINT "_CampaignToTopIssue_B_fkey" FOREIGN KEY ("B") REFERENCES "top_issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
