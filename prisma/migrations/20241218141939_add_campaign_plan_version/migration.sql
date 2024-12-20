-- CreateTable
CREATE TABLE "campaign_plan_version" (
    "id" SERIAL NOT NULL,
    "campaign_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "campaign_plan_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_plan_version_campaign_id_key" ON "campaign_plan_version"("campaign_id");

-- AddForeignKey
ALTER TABLE "campaign_plan_version" ADD CONSTRAINT "campaign_plan_version_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
