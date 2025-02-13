/*
  Warnings:

  - A unique constraint covering the columns `[mtfcc,mtfcc_type,geo_id,name,state]` on the table `census_entity` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "election_type" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT,
    "category" TEXT,

    CONSTRAINT "election_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "election_type_name_state_category_key" ON "election_type"("name", "state", "category");

-- CreateIndex
CREATE UNIQUE INDEX "census_entity_mtfcc_mtfcc_type_geo_id_name_state_key" ON "census_entity"("mtfcc", "mtfcc_type", "geo_id", "name", "state");
