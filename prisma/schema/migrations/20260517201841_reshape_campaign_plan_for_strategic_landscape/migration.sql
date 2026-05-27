-- CreateTable
CREATE TABLE "campaign_strategy" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "campaign_id" INTEGER NOT NULL,

    CONSTRAINT "campaign_strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_strategy_challenge" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaign_strategy_id" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "campaign_strategy_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_strategy_opponent" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaign_strategy_id" INTEGER NOT NULL,
    "full_name" TEXT NOT NULL,
    "party_affiliation" TEXT NOT NULL,
    "incumbent" BOOLEAN,
    "political_summary" TEXT NOT NULL,

    CONSTRAINT "campaign_strategy_opponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_strategy_opponent_key_fact" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opponent_id" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "campaign_strategy_opponent_key_fact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_strategy_opponent_website" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opponent_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "campaign_strategy_opponent_website_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_strategy_opportunity" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaign_strategy_id" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "campaign_strategy_opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_strategy_campaign_id_key" ON "campaign_strategy"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_strategy_challenge_campaign_strategy_id_idx" ON "campaign_strategy_challenge"("campaign_strategy_id");

-- CreateIndex
CREATE INDEX "campaign_strategy_opponent_campaign_strategy_id_idx" ON "campaign_strategy_opponent"("campaign_strategy_id");

-- CreateIndex
CREATE INDEX "campaign_strategy_opponent_key_fact_opponent_id_idx" ON "campaign_strategy_opponent_key_fact"("opponent_id");

-- CreateIndex
CREATE INDEX "campaign_strategy_opponent_website_opponent_id_idx" ON "campaign_strategy_opponent_website"("opponent_id");

-- CreateIndex
CREATE INDEX "campaign_strategy_opportunity_campaign_strategy_id_idx" ON "campaign_strategy_opportunity"("campaign_strategy_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_strategy_opportunity_campaign_strategy_id_order_key" ON "campaign_strategy_opportunity"("campaign_strategy_id", "order");

-- AddForeignKey
ALTER TABLE "campaign_strategy" ADD CONSTRAINT "campaign_strategy_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_strategy_challenge" ADD CONSTRAINT "campaign_strategy_challenge_campaign_strategy_id_fkey" FOREIGN KEY ("campaign_strategy_id") REFERENCES "campaign_strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_strategy_opponent" ADD CONSTRAINT "campaign_strategy_opponent_campaign_strategy_id_fkey" FOREIGN KEY ("campaign_strategy_id") REFERENCES "campaign_strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_strategy_opponent_key_fact" ADD CONSTRAINT "campaign_strategy_opponent_key_fact_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "campaign_strategy_opponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_strategy_opponent_website" ADD CONSTRAINT "campaign_strategy_opponent_website_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "campaign_strategy_opponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_strategy_opportunity" ADD CONSTRAINT "campaign_strategy_opportunity_campaign_strategy_id_fkey" FOREIGN KEY ("campaign_strategy_id") REFERENCES "campaign_strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
