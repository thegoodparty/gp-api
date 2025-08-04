/*
  Warnings:

  - You are about to drop the `_CampaignTopIssues` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_CampaignTopIssues" DROP CONSTRAINT "_CampaignTopIssues_A_fkey";

-- DropForeignKey
ALTER TABLE "_CampaignTopIssues" DROP CONSTRAINT "_CampaignTopIssues_B_fkey";

-- DropTable
DROP TABLE "_CampaignTopIssues";

-- CreateTable
CREATE TABLE "_CampaignToTopIssue" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CampaignToTopIssue_AB_unique" ON "_CampaignToTopIssue"("A", "B");

-- CreateIndex
CREATE INDEX "_CampaignToTopIssue_B_index" ON "_CampaignToTopIssue"("B");

-- AddForeignKey
ALTER TABLE "_CampaignToTopIssue" ADD CONSTRAINT "_CampaignToTopIssue_A_fkey" FOREIGN KEY ("A") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CampaignToTopIssue" ADD CONSTRAINT "_CampaignToTopIssue_B_fkey" FOREIGN KEY ("B") REFERENCES "top_issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
