-- DropForeignKey
ALTER TABLE "campaign" DROP CONSTRAINT "campaign_user_id_fkey";

-- AddForeignKey
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
