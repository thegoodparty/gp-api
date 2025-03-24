-- CreateEnum
CREATE TYPE "TextCampaignStatus" AS ENUM ('pending', 'approved', 'denied');

-- CreateTable
CREATE TABLE "text_campaign" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "projectId" TEXT,
    "name" TEXT,
    "message" TEXT,
    "status" "TextCampaignStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "audience" JSONB,
    "script" TEXT,
    "date" TIMESTAMP(3),
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "text_campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "text_campaign_campaignId_idx" ON "text_campaign"("campaignId");

-- AddForeignKey
ALTER TABLE "text_campaign" ADD CONSTRAINT "text_campaign_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
