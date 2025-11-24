/*
  Warnings:

  - You are about to drop the `county` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `election_type` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `municipality` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "municipality" DROP CONSTRAINT "municipality_county_id_fkey";

-- DropTable
DROP TABLE "county";

-- DropTable
DROP TABLE "election_type";

-- DropTable
DROP TABLE "municipality";

-- DropEnum
DROP TYPE "MunicipalityType";
