UPDATE "campaign_task"
SET "date" = "created_at"
WHERE "date" IS NULL;

ALTER TABLE "campaign_task" ALTER COLUMN "date" SET NOT NULL;
