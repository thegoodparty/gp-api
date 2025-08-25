-- CreateTable
CREATE TABLE "campaign_plan" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "campaign_info_hash" TEXT NOT NULL,
    "overview" TEXT,
    "strategic_landscape_electoral_goals" TEXT,
    "campaign_timeline" TEXT,
    "recommended_total_budget" TEXT,
    "know_your_community" TEXT,
    "voter_contact_plan" TEXT,
    "raw_json" JSONB,
    "campaign_id" INTEGER NOT NULL,

    CONSTRAINT "campaign_plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_plan_campaign_id_key" ON "campaign_plan"("campaign_id");

-- AddForeignKey
ALTER TABLE "campaign_plan" ADD CONSTRAINT "campaign_plan_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
