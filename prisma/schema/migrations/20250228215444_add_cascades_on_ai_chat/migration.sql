-- DropForeignKey
ALTER TABLE "ai_chat" DROP CONSTRAINT "ai_chat_campaign_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_chat" DROP CONSTRAINT "ai_chat_user_id_fkey";

-- AddForeignKey
ALTER TABLE "ai_chat" ADD CONSTRAINT "ai_chat_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat" ADD CONSTRAINT "ai_chat_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
