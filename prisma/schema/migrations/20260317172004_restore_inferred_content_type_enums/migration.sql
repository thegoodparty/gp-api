-- Restore enum values that are actual Contentful content types synced to the DB
ALTER TYPE "ContentType" ADD VALUE IF NOT EXISTS 'aiContentCategories';
ALTER TYPE "ContentType" ADD VALUE IF NOT EXISTS 'candidateContentPrompts';
ALTER TYPE "ContentType" ADD VALUE IF NOT EXISTS 'contentPromptsQuestions';
