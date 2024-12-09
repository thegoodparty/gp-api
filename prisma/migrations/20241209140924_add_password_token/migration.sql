-- AlterTable
ALTER TABLE "_CampaignToTopIssue" ADD CONSTRAINT "_CampaignToTopIssue_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_CampaignToTopIssue_AB_unique";

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "password_reset_token" TEXT;
