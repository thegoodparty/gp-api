-- Drop BlogArticleMeta table (cascade handles FK constraint)
DROP TABLE IF EXISTS "blog_article_meta" CASCADE;

-- Delete content rows with marketing-only types before removing enum values
DELETE FROM "content" WHERE "type" IN (
  'articleCategory',
  'blogArticle',
  'blogHome',
  'blogSection',
  'candidateTestimonial',
  'election',
  'faqArticle',
  'faqOrder',
  'glossaryItem',
  'goodPartyTeamMembers',
  'privacyPage',
  'redirects',
  'teamMember',
  'teamMilestone',
  'termsOfService'
);

-- Create new enum type with only the values we need
CREATE TYPE "ContentType_new" AS ENUM (
  'aiChatPrompt',
  'aiContentCategories',
  'aiContentTemplate',
  'candidateContentPrompts',
  'contentPromptsQuestions',
  'onboardingPrompts',
  'pledge',
  'promptInputFields'
);

-- Alter the column to use the new enum type
ALTER TABLE "content"
  ALTER COLUMN "type" TYPE "ContentType_new"
  USING ("type"::text::"ContentType_new");

-- Drop the old enum and rename the new one
DROP TYPE "ContentType";
ALTER TYPE "ContentType_new" RENAME TO "ContentType";
