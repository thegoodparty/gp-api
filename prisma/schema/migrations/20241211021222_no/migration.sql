-- DropForeignKey
ALTER TABLE "campaign_position" DROP CONSTRAINT "campaign_position_position_id_fkey";

-- AlterTable
ALTER TABLE "_CampaignToTopIssue" ADD CONSTRAINT "_CampaignToTopIssue_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_CampaignToTopIssue_AB_unique";

-- AddForeignKey
ALTER TABLE "campaign_position" ADD CONSTRAINT "campaign_position_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position"("id") ON DELETE CASCADE ON UPDATE CASCADE;
