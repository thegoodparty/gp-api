/*
  Warnings:

  - You are about to rename the column `operation_id` to `domain_operation_id` on the `website` table.
  - You are about to rename the column `status` to `domain_status` on the `website` table.
  - You are about to rename the enum type `WebsiteStatus` to `WebsiteDomainStatus`.

*/
-- Rename the enum type
ALTER TYPE "WebsiteStatus" RENAME TO "WebsiteDomainStatus";

-- AlterTable
ALTER TABLE "website" RENAME COLUMN "operation_id" TO "domain_operation_id";
ALTER TABLE "website" RENAME COLUMN "status" TO "domain_status";
ALTER TABLE "website" ALTER COLUMN "domain" DROP NOT NULL;
ALTER TABLE "website" ALTER COLUMN "domain_status" DROP NOT NULL;
ALTER TABLE "website" ALTER COLUMN "domain_status" DROP DEFAULT;
