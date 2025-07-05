/*
  Warnings:

  - The values [inReview,resolved,deferred] on the enum `Status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Status_new" AS ENUM ('newIssue', 'accepted', 'inProgress', 'wontDo', 'completed');
ALTER TABLE "community_issue" ALTER COLUMN "status" TYPE "Status_new" USING ("status"::text::"Status_new");
ALTER TYPE "Status" RENAME TO "Status_old";
ALTER TYPE "Status_new" RENAME TO "Status";
DROP TYPE "Status_old";
COMMIT;

-- AlterTable
ALTER TABLE "community_issue" ADD COLUMN     "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[];
