/*
  Warnings:

  - The values [waitingOnPin] on the enum `TcrComplianceStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TcrComplianceStatus_new" AS ENUM ('submitted', 'pending', 'approved', 'rejected', 'error');
ALTER TABLE "tcr_compliance" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tcr_compliance" ALTER COLUMN "status" TYPE "TcrComplianceStatus_new" USING ("status"::text::"TcrComplianceStatus_new");
ALTER TYPE "TcrComplianceStatus" RENAME TO "TcrComplianceStatus_old";
ALTER TYPE "TcrComplianceStatus_new" RENAME TO "TcrComplianceStatus";
DROP TYPE "TcrComplianceStatus_old";
ALTER TABLE "tcr_compliance" ALTER COLUMN "status" SET DEFAULT 'submitted';
COMMIT;
