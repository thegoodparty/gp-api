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
    "audience_superVoters" BOOLEAN DEFAULT false,
    "audience_likelyVoters" BOOLEAN DEFAULT false,
    "audience_unreliableVoters" BOOLEAN DEFAULT false,
    "audience_unlikelyVoters" BOOLEAN DEFAULT false,
    "audience_firstTimeVoters" BOOLEAN DEFAULT false,
    "party_independent" BOOLEAN DEFAULT false,
    "party_democrat" BOOLEAN DEFAULT false,
    "party_republican" BOOLEAN DEFAULT false,
    "age_18_25" BOOLEAN DEFAULT false,
    "age_25_35" BOOLEAN DEFAULT false,
    "age_35_50" BOOLEAN DEFAULT false,
    "age_50_plus" BOOLEAN DEFAULT false,
    "gender_male" BOOLEAN DEFAULT false,
    "gender_female" BOOLEAN DEFAULT false,
    "gender_unknown" BOOLEAN DEFAULT false,
    "audience_request" TEXT,
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
