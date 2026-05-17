/*
  Warnings:

  - You are about to drop the column `campaign_info_hash` on the `campaign_plan` table. All the data in the column will be lost.
  - You are about to drop the column `plan` on the `campaign_plan` table. All the data in the column will be lost.
  - You are about to drop the column `raw_json` on the `campaign_plan` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "campaign_plan" DROP COLUMN "campaign_info_hash",
DROP COLUMN "plan",
DROP COLUMN "raw_json";

-- CreateTable
CREATE TABLE "campaign_plan_challenge" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaign_plan_id" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "campaign_plan_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_plan_opponent" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaign_plan_id" INTEGER NOT NULL,
    "full_name" TEXT NOT NULL,
    "party_affiliation" TEXT NOT NULL,
    "incumbent" BOOLEAN,
    "political_summary" TEXT NOT NULL,

    CONSTRAINT "campaign_plan_opponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_plan_opponent_key_fact" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opponent_id" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "campaign_plan_opponent_key_fact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_plan_opponent_website" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opponent_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "campaign_plan_opponent_website_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_plan_opportunity" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaign_plan_id" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "campaign_plan_opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_plan_challenge_campaign_plan_id_idx" ON "campaign_plan_challenge"("campaign_plan_id");

-- CreateIndex
CREATE INDEX "campaign_plan_opponent_campaign_plan_id_idx" ON "campaign_plan_opponent"("campaign_plan_id");

-- CreateIndex
CREATE INDEX "campaign_plan_opponent_key_fact_opponent_id_idx" ON "campaign_plan_opponent_key_fact"("opponent_id");

-- CreateIndex
CREATE INDEX "campaign_plan_opponent_website_opponent_id_idx" ON "campaign_plan_opponent_website"("opponent_id");

-- CreateIndex
CREATE INDEX "campaign_plan_opportunity_campaign_plan_id_idx" ON "campaign_plan_opportunity"("campaign_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_plan_opportunity_campaign_plan_id_order_key" ON "campaign_plan_opportunity"("campaign_plan_id", "order");

-- AddForeignKey
ALTER TABLE "campaign_plan_challenge" ADD CONSTRAINT "campaign_plan_challenge_campaign_plan_id_fkey" FOREIGN KEY ("campaign_plan_id") REFERENCES "campaign_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_plan_opponent" ADD CONSTRAINT "campaign_plan_opponent_campaign_plan_id_fkey" FOREIGN KEY ("campaign_plan_id") REFERENCES "campaign_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_plan_opponent_key_fact" ADD CONSTRAINT "campaign_plan_opponent_key_fact_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "campaign_plan_opponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_plan_opponent_website" ADD CONSTRAINT "campaign_plan_opponent_website_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "campaign_plan_opponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_plan_opportunity" ADD CONSTRAINT "campaign_plan_opportunity_campaign_plan_id_fkey" FOREIGN KEY ("campaign_plan_id") REFERENCES "campaign_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
