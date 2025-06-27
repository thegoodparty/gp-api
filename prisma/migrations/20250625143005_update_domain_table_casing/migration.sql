/*
  Warnings:

  - You are about to drop the `Domain` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Domain" DROP CONSTRAINT "Domain_websiteId_fkey";

-- DropTable
DROP TABLE "Domain";

-- CreateTable
CREATE TABLE "domain" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "website_id" INTEGER NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'pending',
    "operation_id" TEXT,
    "price" INTEGER,
    "payment_id" TEXT,

    CONSTRAINT "domain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domain_name_key" ON "domain"("name");

-- CreateIndex
CREATE UNIQUE INDEX "domain_website_id_key" ON "domain"("website_id");

-- AddForeignKey
ALTER TABLE "domain" ADD CONSTRAINT "domain_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "website"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
