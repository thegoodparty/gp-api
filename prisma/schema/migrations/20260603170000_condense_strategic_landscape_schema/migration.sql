-- Slim CampaignStrategyOpponent and add run-id tracking to CampaignStrategy
-- DropForeignKey
ALTER TABLE "campaign_strategy_opponent_key_fact" DROP CONSTRAINT "campaign_strategy_opponent_key_fact_opponent_id_fkey";

-- DropForeignKey
ALTER TABLE "campaign_strategy_opponent_website" DROP CONSTRAINT "campaign_strategy_opponent_website_opponent_id_fkey";

-- AlterTable
ALTER TABLE "campaign_strategy" ADD COLUMN     "opportunities_run_id" TEXT,
ADD COLUMN     "opposition_run_id" TEXT;

-- AlterTable
ALTER TABLE "campaign_strategy_opponent" DROP COLUMN "political_summary";

-- DropTable
DROP TABLE "campaign_strategy_opponent_key_fact";

-- DropTable
DROP TABLE "campaign_strategy_opponent_website";

-- Add persisted-at markers and run-id indexes
-- AlterTable
ALTER TABLE "campaign_strategy" ADD COLUMN     "opportunities_persisted_at" TIMESTAMP(3),
ADD COLUMN     "opposition_persisted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "campaign_strategy_opposition_run_id_idx" ON "campaign_strategy"("opposition_run_id");

-- CreateIndex
CREATE INDEX "campaign_strategy_opportunities_run_id_idx" ON "campaign_strategy"("opportunities_run_id");

-- Add per-section retry attempt counters
-- AlterTable
ALTER TABLE "campaign_strategy" ADD COLUMN     "opportunities_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "opposition_attempts" INTEGER NOT NULL DEFAULT 0;

-- Add generation-started-at duration anchor
-- AlterTable
ALTER TABLE "campaign_strategy" ADD COLUMN     "generation_started_at" TIMESTAMP(3);
