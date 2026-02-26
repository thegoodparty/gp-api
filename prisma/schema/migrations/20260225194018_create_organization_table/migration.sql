/*
  Warnings:

  - A unique constraint covering the columns `[organization_slug]` on the table `campaign` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organization_slug]` on the table `elected_office` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "campaign" ADD COLUMN     "organization_slug" TEXT;

-- AlterTable
ALTER TABLE "elected_office" ADD COLUMN     "organization_slug" TEXT;

-- CreateTable
CREATE TABLE "organization" (
    "slug" TEXT NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "position_id" TEXT,
    "override_district_id" TEXT,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "organization_owner_id_idx" ON "organization"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_organization_slug_key" ON "campaign"("organization_slug");

-- CreateIndex
CREATE UNIQUE INDEX "elected_office_organization_slug_key" ON "elected_office"("organization_slug");

-- AddForeignKey
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_organization_slug_fkey" FOREIGN KEY ("organization_slug") REFERENCES "organization"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elected_office" ADD CONSTRAINT "elected_office_organization_slug_fkey" FOREIGN KEY ("organization_slug") REFERENCES "organization"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
