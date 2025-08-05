/*
  Warnings:

  - You are about to drop the column `role` on the `user` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "_CampaignToTopIssue" ADD CONSTRAINT "_CampaignToTopIssue_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_CampaignToTopIssue_AB_unique";

-- AlterTable
ALTER TABLE "user" DROP COLUMN "role",
ADD COLUMN     "roles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[];
