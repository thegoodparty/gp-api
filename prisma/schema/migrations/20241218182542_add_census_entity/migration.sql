-- CreateTable
CREATE TABLE "CensusEntity" (
    "id" SERIAL NOT NULL,
    "mtfcc" TEXT NOT NULL,
    "mtfccType" TEXT NOT NULL,
    "geoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "CensusEntity_pkey" PRIMARY KEY ("id")
);
