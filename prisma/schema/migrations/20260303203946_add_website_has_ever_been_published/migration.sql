-- AlterTable
ALTER TABLE "website" ADD COLUMN     "has_ever_been_published" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: websites currently published
UPDATE "website" SET "has_ever_been_published" = true
WHERE "status" = 'published';

-- Backfill: websites that were published via the create flow then unpublished
-- (createStep is set to 'complete' by the frontend on publish and is never cleared on unpublish)
UPDATE "website" SET "has_ever_been_published" = true
WHERE "status" = 'unpublished'
  AND "content"->>'createStep' = 'complete';
