-- CreateTable
CREATE TABLE "Race" (
    "id" TEXT NOT NULL,
    "ballotId" TEXT NOT NULL,
    "ballotHashId" TEXT,
    "hashId" TEXT NOT NULL,
    "positionSlug" TEXT,
    "state" CHAR(2) NOT NULL,
    "electionDate" TIMESTAMP(3),
    "level" TEXT NOT NULL,
    "subAreaName" TEXT,
    "subAreaValue" TEXT,
    "data" JSONB,
    "countyId" TEXT,
    "municipalityId" TEXT,

    CONSTRAINT "Race_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "County" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "data" JSONB,

    CONSTRAINT "County_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Municipality" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "data" JSONB,
    "countyId" TEXT,

    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Race_ballotId_key" ON "Race"("ballotId");

-- CreateIndex
CREATE UNIQUE INDEX "Race_hashId_key" ON "Race"("hashId");

-- CreateIndex
CREATE UNIQUE INDEX "County_slug_key" ON "County"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Municipality_slug_key" ON "Municipality"("slug");

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_countyId_fkey" FOREIGN KEY ("countyId") REFERENCES "County"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Municipality" ADD CONSTRAINT "Municipality_countyId_fkey" FOREIGN KEY ("countyId") REFERENCES "County"("id") ON DELETE SET NULL ON UPDATE CASCADE;
