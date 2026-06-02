-- AlterTable
ALTER TABLE "campaign_strategy" ADD COLUMN     "opportunities_persisted_at" TIMESTAMP(3),
ADD COLUMN     "opposition_persisted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "campaign_strategy_opposition_run_id_idx" ON "campaign_strategy"("opposition_run_id");

-- CreateIndex
CREATE INDEX "campaign_strategy_opportunities_run_id_idx" ON "campaign_strategy"("opportunities_run_id");
