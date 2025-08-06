/*
  Warnings:

  - Made the column `positionSlug` on table `Race` required. This step will fail if there are existing NULL values in that column.
  - Made the column `data` on table `Race` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Race" ALTER COLUMN "positionSlug" SET NOT NULL,
ALTER COLUMN "data" SET NOT NULL;
