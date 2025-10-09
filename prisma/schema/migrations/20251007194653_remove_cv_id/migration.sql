/*
  Warnings:

  - You are about to drop the column `peerly_cv_verification_id` on the `tcr_compliance` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "tcr_compliance_peerly_cv_verification_id_key";

-- AlterTable
ALTER TABLE "tcr_compliance" DROP COLUMN "peerly_cv_verification_id";
