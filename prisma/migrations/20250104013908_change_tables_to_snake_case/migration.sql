/*
  Warnings:

  - You are about to drop the `CensusEntity` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "CensusEntity";

-- CreateTable
CREATE TABLE "census_entity" (
    "id" SERIAL NOT NULL,
    "mtfcc" TEXT NOT NULL,
    "mtfcc_type" TEXT NOT NULL,
    "geo_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "census_entity_pkey" PRIMARY KEY ("id")
);
