/*
  Warnings:

  - The primary key for the `_CampaignToTopIssue` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[A,B]` on the table `_CampaignToTopIssue` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "_CampaignToTopIssue" DROP CONSTRAINT "_CampaignToTopIssue_AB_pkey";

-- CreateIndex
CREATE UNIQUE INDEX "_CampaignToTopIssue_AB_unique" ON "_CampaignToTopIssue"("A", "B");
