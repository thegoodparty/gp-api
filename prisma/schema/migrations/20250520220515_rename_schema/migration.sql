/*
  Warnings:

  - You are about to drop the `text_campaign` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "OutreachType" AS ENUM ('p2pTexting', 'doorKnocking', 'phoneBanking');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('pending', 'approved', 'denied', 'paid', 'in_progress', 'completed');

-- DropForeignKey
ALTER TABLE "text_campaign" DROP CONSTRAINT "text_campaign_campaignId_fkey";

-- DropTable
DROP TABLE "text_campaign";

-- DropEnum
DROP TYPE "TextCampaignStatus";

-- CreateTable
CREATE TABLE "outreach" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "outreachType" "OutreachType" DEFAULT 'p2pTexting',
    "projectId" TEXT,
    "name" TEXT,
    "status" "OutreachStatus" DEFAULT 'pending',
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
    "message" TEXT,
    "date" TIMESTAMP(3),
    "imageUrl" TEXT,

    CONSTRAINT "outreach_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outreach_campaignId_idx" ON "outreach"("campaignId");

-- AddForeignKey
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
