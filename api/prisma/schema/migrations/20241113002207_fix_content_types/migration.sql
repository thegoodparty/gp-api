/*
  Warnings:

  - The values [articleCategories,faqArticles,articleTags,recentGlossaryItems,aiChatPrompts,elections,glossaryItems,glossaryItemsByTitle,aiContentCategories,candidateTestimonials,contentPromptsQuestions,blogSections,glossaryItemsByLetter,candidateContentPrompts,blogArticles] on the enum `ContentType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ContentType_new" AS ENUM ('aiChatPrompt', 'aiContentTemplate', 'articleCategory', 'blogArticle', 'blogHome', 'blogSection', 'candidateTestimonial', 'election', 'faqArticle', 'faqOrder', 'glossaryItem', 'goodPartyTeamMembers', 'onboardingPrompts', 'pledge', 'privacyPage', 'promptInputFields', 'redirects', 'teamMilestone', 'termsOfService');
ALTER TABLE "Content" ALTER COLUMN "type" TYPE "ContentType_new" USING ("type"::text::"ContentType_new");
ALTER TYPE "ContentType" RENAME TO "ContentType_old";
ALTER TYPE "ContentType_new" RENAME TO "ContentType";
DROP TYPE "ContentType_old";
COMMIT;
