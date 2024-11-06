-- CreateTable
CREATE TABLE "Content" (
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "subKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);
