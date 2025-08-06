/*
  Warnings:

  - A unique constraint covering the columns `[campaign_id]` on the table `tcr_compliance` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "tcr_compliance_campaign_id_key" ON "tcr_compliance"("campaign_id");
