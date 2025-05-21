/*
  Warnings:

  - You are about to drop the column `campaign_id` on the `tcr_compliance` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[tcr_compliance_id]` on the table `campaign` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "tcr_compliance" DROP CONSTRAINT "tcr_compliance_campaign_id_fkey";

-- DropIndex
DROP INDEX "tcr_compliance_campaign_id_idx";

-- DropIndex
DROP INDEX "tcr_compliance_campaign_id_key";

-- AlterTable
ALTER TABLE "campaign" ADD COLUMN     "tcr_compliance_id" INTEGER;

-- AlterTable
ALTER TABLE "tcr_compliance" DROP COLUMN "campaign_id";

-- CreateIndex
CREATE UNIQUE INDEX "campaign_tcr_compliance_id_key" ON "campaign"("tcr_compliance_id");

-- AddForeignKey
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_tcr_compliance_id_fkey" FOREIGN KEY ("tcr_compliance_id") REFERENCES "tcr_compliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
