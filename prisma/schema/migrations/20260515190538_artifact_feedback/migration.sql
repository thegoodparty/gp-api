-- CreateEnum
CREATE TYPE "ArtifactResourceType" AS ENUM ('briefing');

-- CreateTable
CREATE TABLE "artifact_feedback" (
    "id" TEXT NOT NULL,
    "organization_slug" TEXT NOT NULL,
    "submitter_user_id" INTEGER NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "artifact_type" "ArtifactResourceType" NOT NULL,
    "feedback" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifact_feedback_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "artifact_feedback" ADD CONSTRAINT "artifact_feedback_organization_slug_fkey" FOREIGN KEY ("organization_slug") REFERENCES "organization"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifact_feedback" ADD CONSTRAINT "artifact_feedback_submitter_user_id_fkey" FOREIGN KEY ("submitter_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
