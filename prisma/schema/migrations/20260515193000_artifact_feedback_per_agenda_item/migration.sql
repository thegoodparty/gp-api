ALTER TABLE "artifact_feedback" DROP COLUMN "artifact_type";
DROP TYPE "ArtifactResourceType";
CREATE TYPE "ArtifactResourceType" AS ENUM ('agenda_item');
ALTER TABLE "artifact_feedback" ADD COLUMN "artifact_type" "ArtifactResourceType" NOT NULL;

ALTER TABLE "artifact_feedback" DROP COLUMN "feedback";
CREATE TYPE "ArtifactFeedbackKind" AS ENUM ('positive', 'negative');
ALTER TABLE "artifact_feedback" ADD COLUMN "feedback" "ArtifactFeedbackKind" NOT NULL;

ALTER TABLE "artifact_feedback" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "artifact_feedback_user_artifact_unique"
  ON "artifact_feedback" ("submitter_user_id", "artifact_id", "artifact_type");

CREATE INDEX "artifact_feedback_organization_slug_idx"
  ON "artifact_feedback" ("organization_slug");

CREATE INDEX "artifact_feedback_artifact_type_artifact_id_idx"
  ON "artifact_feedback" ("artifact_type", "artifact_id");
