-- DropForeignKey
ALTER TABLE "campaign_plan_version" DROP CONSTRAINT "campaign_plan_version_campaign_id_fkey";

-- DropForeignKey
ALTER TABLE "campaign_position" DROP CONSTRAINT "campaign_position_campaign_id_fkey";

-- DropForeignKey
ALTER TABLE "campaign_update_history" DROP CONSTRAINT "campaign_update_history_campaign_id_fkey";

-- DropForeignKey
ALTER TABLE "campaign_update_history" DROP CONSTRAINT "campaign_update_history_user_id_fkey";

-- AddForeignKey
ALTER TABLE "campaign_plan_version" ADD CONSTRAINT "campaign_plan_version_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_position" ADD CONSTRAINT "campaign_position_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_update_history" ADD CONSTRAINT "campaign_update_history_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_update_history" ADD CONSTRAINT "campaign_update_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
