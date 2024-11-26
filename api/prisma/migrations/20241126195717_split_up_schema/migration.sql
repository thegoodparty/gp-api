/*
  Warnings:

  - You are about to drop the `campaign` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `campaign_update_history` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `content` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `path_to_victory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "campaign" DROP CONSTRAINT "campaign_user_id_fkey";

-- DropForeignKey
ALTER TABLE "campaign_update_history" DROP CONSTRAINT "campaign_update_history_campaign_id_fkey";

-- DropForeignKey
ALTER TABLE "campaign_update_history" DROP CONSTRAINT "campaign_update_history_user_id_fkey";

-- DropForeignKey
ALTER TABLE "path_to_victory" DROP CONSTRAINT "path_to_victory_campaign_id_fkey";

-- DropTable
DROP TABLE "campaign";

-- DropTable
DROP TABLE "campaign_update_history";

-- DropTable
DROP TABLE "content";

-- DropTable
DROP TABLE "path_to_victory";

-- DropTable
DROP TABLE "user";

-- DropEnum
DROP TYPE "CampaignTier";

-- DropEnum
DROP TYPE "CampaignUpdateHistoryType";

-- DropEnum
DROP TYPE "ContentType";
