-- DropIndex
DROP INDEX "experiment_run_candidate_id_idx";

-- DropIndex
DROP INDEX "experiment_run_experiment_id_idx";

-- AlterTable
ALTER TABLE "experiment_run" DROP COLUMN "candidate_id",
ADD COLUMN "organization_slug" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "experiment_run_organization_slug_experiment_id_idx" ON "experiment_run"("organization_slug", "experiment_id");

-- AddForeignKey
ALTER TABLE "experiment_run" ADD CONSTRAINT "experiment_run_organization_slug_fkey" FOREIGN KEY ("organization_slug") REFERENCES "organization"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
