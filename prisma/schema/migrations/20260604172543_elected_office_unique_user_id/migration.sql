-- Dedup: keep the earliest row per user_id, delete duplicates
-- (child rows cascade via onDelete: Cascade) so the unique index can be built
DELETE FROM "elected_office"
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM "elected_office"
  ORDER BY user_id, created_at ASC
);

-- DropIndex
DROP INDEX "elected_office_user_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "elected_office_user_id_key" ON "elected_office"("user_id");
