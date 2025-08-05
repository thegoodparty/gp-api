/*
  Warnings:

  - You are about to drop the `race` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "race" DROP CONSTRAINT "race_county_id_fkey";

-- DropForeignKey
ALTER TABLE "race" DROP CONSTRAINT "race_municipality_id_fkey";

-- DropTable
DROP TABLE "race";

-- DropEnum
DROP TYPE "LevelType";
