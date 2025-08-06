/*
  Warnings:

  - Made the column `subAreaName` on table `Race` required. This step will fail if there are existing NULL values in that column.
  - Made the column `subAreaValue` on table `Race` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Race" ALTER COLUMN "subAreaName" SET NOT NULL,
ALTER COLUMN "subAreaValue" SET NOT NULL;
