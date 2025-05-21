/*
  Warnings:

  - You are about to drop the column `tcr_compliance_id` on the `campaign` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[campaign_id]` on the table `tcr_compliance` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "campaign" DROP CONSTRAINT "campaign_tcr_compliance_id_fkey";

-- DropIndex
DROP INDEX "campaign_tcr_compliance_id_key";

-- AlterTable
ALTER TABLE "campaign" DROP COLUMN "tcr_compliance_id";

-- CreateIndex
CREATE UNIQUE INDEX "tcr_compliance_campaign_id_key" ON "tcr_compliance"("campaign_id");

-- AddForeignKey
ALTER TABLE "tcr_compliance" ADD CONSTRAINT "tcr_compliance_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
