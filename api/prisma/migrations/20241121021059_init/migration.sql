-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('aiChatPrompt', 'aiContentTemplate', 'articleCategory', 'blogArticle', 'blogHome', 'blogSection', 'candidateTestimonial', 'election', 'faqArticle', 'faqOrder', 'glossaryItem', 'goodPartyTeamMembers', 'onboardingPrompts', 'pledge', 'privacyPage', 'promptInputFields', 'redirects', 'teamMember', 'teamMilestone', 'termsOfService');

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
