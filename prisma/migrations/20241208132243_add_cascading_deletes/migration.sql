-- DropForeignKey
ALTER TABLE "campaign_position" DROP CONSTRAINT "campaign_position_top_issue_id_fkey";

-- DropForeignKey
ALTER TABLE "position" DROP CONSTRAINT "position_top_issue_id_fkey";

-- AddForeignKey
ALTER TABLE "campaign_position" ADD CONSTRAINT "campaign_position_top_issue_id_fkey" FOREIGN KEY ("top_issue_id") REFERENCES "top_issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_top_issue_id_fkey" FOREIGN KEY ("top_issue_id") REFERENCES "top_issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
