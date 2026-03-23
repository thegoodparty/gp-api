/*
  Warnings:

  - A unique constraint covering the columns `[peerly_cv_verification_id]` on the table `tcr_compliance` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "tcr_compliance" ADD COLUMN     "peerly_cv_verification_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tcr_compliance_peerly_cv_verification_id_key" ON "tcr_compliance"("peerly_cv_verification_id");
