/*
  Warnings:

  - You are about to drop the column `domain` on the `website` table. All the data in the column will be lost.
  - You are about to drop the column `domain_operation_id` on the `website` table. All the data in the column will be lost.
  - You are about to drop the column `domain_status` on the `website` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('pending', 'submitted', 'registered', 'active', 'inactive');

-- DropIndex
DROP INDEX "website_domain_key";

-- AlterTable
ALTER TABLE "website" DROP COLUMN "domain",
DROP COLUMN "domain_operation_id",
DROP COLUMN "domain_status";

-- DropEnum
DROP TYPE "WebsiteDomainStatus";

-- CreateTable
CREATE TABLE "Domain" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "websiteId" INTEGER NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'pending',
    "operation_id" TEXT,
    "price" INTEGER,
    "payment_id" TEXT,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Domain_name_key" ON "Domain"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_websiteId_key" ON "Domain"("websiteId");

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "website"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
