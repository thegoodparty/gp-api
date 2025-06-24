-- CreateEnum
CREATE TYPE "WebsiteStatus" AS ENUM ('pending', 'active', 'inactive');

-- CreateTable
CREATE TABLE "website" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "domain" TEXT NOT NULL,
    "campaign_id" INTEGER NOT NULL,
    "status" "WebsiteStatus" NOT NULL DEFAULT 'pending',
    "operation_id" TEXT,

    CONSTRAINT "website_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "website_domain_key" ON "website"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "website_campaign_id_key" ON "website"("campaign_id");

-- AddForeignKey
ALTER TABLE "website" ADD CONSTRAINT "website_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
