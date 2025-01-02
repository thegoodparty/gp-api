/*
  Warnings:

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
DROP TABLE "County";

-- DropTable
DROP TABLE "Municipality";

-- DropTable
DROP TABLE "Race";

-- CreateTable
CREATE TABLE "race" (
    "id" SERIAL NOT NULL,
    "ballot_id" TEXT NOT NULL,
    "ballot_hash_id" TEXT,
    "hash_id" TEXT NOT NULL,
    "position_slug" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "election_date" TIMESTAMP(3),
    "level" "LevelType" NOT NULL,
    "sub_area_name" TEXT NOT NULL,
    "sub_area_value" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "county_id" INTEGER,
    "municipality_id" INTEGER,

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
    "county_id" INTEGER,

    CONSTRAINT "municipality_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "race_ballot_id_key" ON "race"("ballot_id");

-- CreateIndex
CREATE UNIQUE INDEX "race_hash_id_key" ON "race"("hash_id");

-- CreateIndex
CREATE UNIQUE INDEX "county_slug_key" ON "county"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "municipality_slug_key" ON "municipality"("slug");

-- AddForeignKey
ALTER TABLE "race" ADD CONSTRAINT "race_county_id_fkey" FOREIGN KEY ("county_id") REFERENCES "county"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race" ADD CONSTRAINT "race_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipality" ADD CONSTRAINT "municipality_county_id_fkey" FOREIGN KEY ("county_id") REFERENCES "county"("id") ON DELETE SET NULL ON UPDATE CASCADE;
