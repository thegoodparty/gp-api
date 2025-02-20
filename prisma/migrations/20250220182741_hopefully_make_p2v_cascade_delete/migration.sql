-- DropForeignKey
ALTER TABLE "path_to_victory" DROP CONSTRAINT "path_to_victory_campaign_id_fkey";

-- AddForeignKey
ALTER TABLE "path_to_victory" ADD CONSTRAINT "path_to_victory_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
