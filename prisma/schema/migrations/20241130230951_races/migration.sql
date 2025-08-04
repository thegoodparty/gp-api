/*
  Warnings:

  - The `electionDate` column on the `Race` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `type` on the `Municipality` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `level` on the `Race` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "LevelType" AS ENUM ('city', 'county', 'state', 'federal');

-- CreateEnum
CREATE TYPE "MunicipalityType" AS ENUM ('city', 'village', 'town', 'township');

-- AlterTable
ALTER TABLE "County" ALTER COLUMN "data" SET DEFAULT '{}';

-- AlterTable
ALTER TABLE "Municipality" DROP COLUMN "type",
ADD COLUMN     "type" "MunicipalityType" NOT NULL,
ALTER COLUMN "data" SET DEFAULT '{}';

-- AlterTable
ALTER TABLE "Race" DROP COLUMN "electionDate",
ADD COLUMN     "electionDate" TIMESTAMP(3),
DROP COLUMN "level",
ADD COLUMN     "level" "LevelType" NOT NULL,
ALTER COLUMN "data" SET DEFAULT '{}';
