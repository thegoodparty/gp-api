/*
  Warnings:

  - You are about to drop the `TopIssue` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_CampaignPositions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_CampaignPositions" DROP CONSTRAINT "_CampaignPositions_A_fkey";

-- DropForeignKey
ALTER TABLE "_CampaignPositions" DROP CONSTRAINT "_CampaignPositions_B_fkey";

-- DropForeignKey
ALTER TABLE "_CampaignTopIssues" DROP CONSTRAINT "_CampaignTopIssues_B_fkey";

-- DropForeignKey
ALTER TABLE "position" DROP CONSTRAINT "position_topIssueId_fkey";

-- DropTable
DROP TABLE "TopIssue";

-- DropTable
DROP TABLE "_CampaignPositions";

-- CreateTable
CREATE TABLE "top_issue" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,

    CONSTRAINT "top_issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_position" (
    "id" SERIAL NOT NULL,
    "description" TEXT,
    "order" INTEGER,
    "campaignId" INTEGER NOT NULL,
    "positionId" INTEGER NOT NULL,
    "topIssueId" INTEGER,

    CONSTRAINT "campaign_position_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "top_issue_name_key" ON "top_issue"("name");

-- CreateIndex
CREATE INDEX "campaign_position_campaignId_idx" ON "campaign_position"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_position_positionId_idx" ON "campaign_position"("positionId");

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_topIssueId_fkey" FOREIGN KEY ("topIssueId") REFERENCES "top_issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_position" ADD CONSTRAINT "campaign_position_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_position" ADD CONSTRAINT "campaign_position_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_position" ADD CONSTRAINT "campaign_position_topIssueId_fkey" FOREIGN KEY ("topIssueId") REFERENCES "top_issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CampaignTopIssues" ADD CONSTRAINT "_CampaignTopIssues_B_fkey" FOREIGN KEY ("B") REFERENCES "top_issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
