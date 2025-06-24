/*
  Warnings:

  - The values [p2pTexting,social] on the enum `OutreachType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "OutreachType_new" AS ENUM ('text', 'doorKnocking', 'phoneBanking', 'socialMedia', 'robocall');
ALTER TABLE "outreach" ALTER COLUMN "outreach_type" TYPE "OutreachType_new" USING ("outreach_type"::text::"OutreachType_new");
ALTER TYPE "OutreachType" RENAME TO "OutreachType_old";
ALTER TYPE "OutreachType_new" RENAME TO "OutreachType";
DROP TYPE "OutreachType_old";
COMMIT;
