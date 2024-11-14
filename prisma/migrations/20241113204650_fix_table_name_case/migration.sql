/*
  Warnings:

  - You are about to drop the `Content` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "Content";

-- CreateTable
CREATE TABLE "content" (
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "content_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_type_idx" ON "content"("type");
