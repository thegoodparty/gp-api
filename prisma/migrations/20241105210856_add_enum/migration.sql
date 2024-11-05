/*
  Warnings:

  - Changed the type of `type` on the `Content` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('onboardingPrompts', 'blogHome', 'pledge', 'goodPartyTeamMembers', 'articleCategories', 'faqArticles', 'articleTags', 'recentGlossaryItems', 'aiChatPrompts', 'elections', 'redirects', 'glossaryItems', 'promptInputFields', 'glossaryItemsByTitle', 'aiContentCategories', 'privacyPage', 'candidateTestimonials', 'contentPromptsQuestions', 'blogSections', 'glossaryItemsByLetter', 'candidateContentPrompts', 'blogArticles', 'termsOfService');

-- AlterTable
ALTER TABLE "Content" DROP COLUMN "type",
ADD COLUMN     "type" "ContentType" NOT NULL;
