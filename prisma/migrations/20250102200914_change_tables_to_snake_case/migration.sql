/*
  Warnings:

  - You are about to drop the `CensusEntity` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `County` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Municipality` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Race` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Municipality" DROP CONSTRAINT "Municipality_countyId_fkey";

-- DropForeignKey
ALTER TABLE "Race" DROP CONSTRAINT "Race_countyId_fkey";

-- DropForeignKey
ALTER TABLE "Race" DROP CONSTRAINT "Race_municipalityId_fkey";

-- DropTable
DROP TABLE "CensusEntity";

-- DropTable
DROP TABLE "County";

-- DropTable
DROP TABLE "Municipality";

-- DropTable
DROP TABLE "Race";

-- CreateTable
CREATE TABLE "race" (
    "id" SERIAL NOT NULL,
    "ballotId" TEXT NOT NULL,
    "ballotHashId" TEXT,
    "hashId" TEXT NOT NULL,
    "positionSlug" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "electionDate" TIMESTAMP(3),
    "level" "LevelType" NOT NULL,
    "subAreaName" TEXT NOT NULL,
    "subAreaValue" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "countyId" INTEGER,
    "municipalityId" INTEGER,

    CONSTRAINT "race_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "county" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "data" JSONB DEFAULT '{}',

    CONSTRAINT "county_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipality" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MunicipalityType" NOT NULL,
    "state" CHAR(2) NOT NULL,
    "data" JSONB DEFAULT '{}',
    "countyId" INTEGER,

    CONSTRAINT "municipality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "censusEntity" (
    "id" SERIAL NOT NULL,
    "mtfcc" TEXT NOT NULL,
    "mtfccType" TEXT NOT NULL,
    "geoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "censusEntity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "race_ballotId_key" ON "race"("ballotId");

-- CreateIndex
CREATE UNIQUE INDEX "race_hashId_key" ON "race"("hashId");

-- CreateIndex
CREATE UNIQUE INDEX "county_slug_key" ON "county"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "municipality_slug_key" ON "municipality"("slug");

-- AddForeignKey
ALTER TABLE "race" ADD CONSTRAINT "race_countyId_fkey" FOREIGN KEY ("countyId") REFERENCES "county"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race" ADD CONSTRAINT "race_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "municipality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipality" ADD CONSTRAINT "municipality_countyId_fkey" FOREIGN KEY ("countyId") REFERENCES "county"("id") ON DELETE SET NULL ON UPDATE CASCADE;
