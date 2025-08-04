/*
  Warnings:

  - A unique constraint covering the columns `[peerly_10dlc_brand_submission_key]` on the table `tcr_compliance` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "tcr_compliance" ADD COLUMN     "peerly_10dlc_brand_submission_key" TEXT,
ADD COLUMN     "peerly_identity_profile_link" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tcr_compliance_peerly_10dlc_brand_submission_key_key" ON "tcr_compliance"("peerly_10dlc_brand_submission_key");
