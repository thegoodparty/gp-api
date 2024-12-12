-- Drop the existing primary key constraint if it exists
ALTER TABLE "_CampaignToTopIssue" DROP CONSTRAINT IF EXISTS "_CampaignToTopIssue_AB_pkey";

-- AlterTable
ALTER TABLE "_CampaignToTopIssue" ADD CONSTRAINT "_CampaignToTopIssue_AB_pkey" PRIMARY KEY ("A", "B");

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "password_reset_token" TEXT;
