/*
  Warnings:

  - You are about to drop the `campaign` table. If the table is not empty, all the data it contains will be lost.
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
DROP TABLE "user";

-- CreateTable
CREATE TABLE "campaigns" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN,
    "is_verified" BOOLEAN,
    "is_pro" BOOLEAN DEFAULT false,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "did_win" BOOLEAN,
    "date_verified" TIMESTAMP(3),
    "tier" "CampaignTier",
    "data" JSONB NOT NULL DEFAULT '{}',
    "details" JSONB NOT NULL DEFAULT '{}',
    "ai_content" JSONB NOT NULL DEFAULT '{}',
    "vendor_ts_data" JSONB NOT NULL DEFAULT '{}',
    "user_id" INTEGER,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "meta_data" JSONB NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_slug_key" ON "campaigns"("slug");

-- CreateIndex
CREATE INDEX "campaigns_slug_idx" ON "campaigns"("slug");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_update_history" ADD CONSTRAINT "campaign_update_history_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_update_history" ADD CONSTRAINT "campaign_update_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_to_victory" ADD CONSTRAINT "path_to_victory_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
