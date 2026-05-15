DELETE FROM "artifact_feedback";

ALTER TABLE "artifact_feedback" DROP COLUMN "artifact_type";
DROP TYPE "ArtifactResourceType";
CREATE TYPE "ArtifactResourceType" AS ENUM ('agenda_item');
ALTER TABLE "artifact_feedback"
  ADD COLUMN "artifact_type" "ArtifactResourceType" NOT NULL DEFAULT 'agenda_item';
ALTER TABLE "artifact_feedback" ALTER COLUMN "artifact_type" DROP DEFAULT;

ALTER TABLE "artifact_feedback" DROP COLUMN "feedback";
CREATE TYPE "ArtifactFeedbackKind" AS ENUM ('positive', 'negative');
ALTER TABLE "artifact_feedback"
  ADD COLUMN "feedback" "ArtifactFeedbackKind" NOT NULL DEFAULT 'positive';
ALTER TABLE "artifact_feedback" ALTER COLUMN "feedback" DROP DEFAULT;

ALTER TABLE "artifact_feedback"
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "artifact_feedback" ADD COLUMN "briefing_id" TEXT NOT NULL;
ALTER TABLE "artifact_feedback"
  ADD CONSTRAINT "artifact_feedback_briefing_id_fkey"
  FOREIGN KEY ("briefing_id") REFERENCES "meeting_briefing" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "artifact_feedback_user_briefing_item_unique"
  ON "artifact_feedback" ("submitter_user_id", "briefing_id", "artifact_id", "artifact_type");

CREATE INDEX "artifact_feedback_organization_slug_idx"
  ON "artifact_feedback" ("organization_slug");

CREATE INDEX "artifact_feedback_briefing_id_idx"
  ON "artifact_feedback" ("briefing_id");
