/*
  Warnings:

  - The values [campaign] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('sales', 'candidate');
ALTER TABLE "user" ALTER COLUMN "roles" DROP DEFAULT;
ALTER TABLE "user" ALTER COLUMN "roles" TYPE "UserRole_new"[] USING ("roles"::text::"UserRole_new"[]);
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "user" ALTER COLUMN "roles" SET DEFAULT ARRAY[]::"UserRole"[];
COMMIT;
