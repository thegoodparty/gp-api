-- CreateEnum
CREATE TYPE "CampaignTier" AS ENUM ('WIN', 'LOSE', 'TOSSUP');

-- CreateEnum
CREATE TYPE "CampaignUpdateHistoryType" AS ENUM ('doorKnocking', 'calls', 'digital', 'directMail', 'digitalAds', 'text', 'events', 'yardSigns');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('aiChatPrompt', 'aiContentTemplate', 'articleCategory', 'blogArticle', 'blogHome', 'blogSection', 'candidateTestimonial', 'election', 'faqArticle', 'faqOrder', 'glossaryItem', 'goodPartyTeamMembers', 'onboardingPrompts', 'pledge', 'privacyPage', 'promptInputFields', 'redirects', 'teamMember', 'teamMilestone', 'termsOfService');

-- CreateTable
CREATE TABLE "campaign" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN,
    "is_verified" BOOLEAN,
    "is_pro" BOOLEAN DEFAULT false,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "did_win" BOOLEAN,
    "date_verified" TIMESTAMP(3),
    "tier" "CampaignTier",
    "data" JSONB NOT NULL DEFAULT '{}',
    "details" JSONB NOT NULL DEFAULT '{}',
    "ai_content" JSONB NOT NULL DEFAULT '{}',
    "vendor_ts_data" JSONB NOT NULL DEFAULT '{}',
    "user_id" INTEGER,

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_update_history" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "campaign_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "CampaignUpdateHistoryType" NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "campaign_update_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content" (
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "path_to_victory" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "campaign_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "path_to_victory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "meta_data" JSONB NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_slug_key" ON "campaign"("slug");

-- CreateIndex
CREATE INDEX "campaign_slug_idx" ON "campaign"("slug");

-- CreateIndex
CREATE INDEX "campaign_update_history_campaign_id_idx" ON "campaign_update_history"("campaign_id");

-- CreateIndex
CREATE INDEX "content_type_idx" ON "content"("type");

-- CreateIndex
CREATE UNIQUE INDEX "path_to_victory_campaign_id_key" ON "path_to_victory"("campaign_id");

-- CreateIndex
CREATE INDEX "path_to_victory_campaign_id_idx" ON "path_to_victory"("campaign_id");

-- AddForeignKey
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_update_history" ADD CONSTRAINT "campaign_update_history_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_update_history" ADD CONSTRAINT "campaign_update_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_to_victory" ADD CONSTRAINT "path_to_victory_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
