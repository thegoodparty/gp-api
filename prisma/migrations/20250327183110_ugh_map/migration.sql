/*
  Warnings:

  - You are about to drop the `ScheduledMessage` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ScheduledMessage" DROP CONSTRAINT "ScheduledMessage_campaign_id_fkey";

-- DropTable
DROP TABLE "ScheduledMessage";

-- CreateTable
CREATE TABLE "scheduled_message" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "campaign_id" INTEGER NOT NULL,
    "sent_at" TIMESTAMP(3),
    "message_config" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,

    CONSTRAINT "scheduled_message_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "scheduled_message" ADD CONSTRAINT "scheduled_message_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
