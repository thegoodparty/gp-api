-- AlterTable
ALTER TABLE "experiment_run" ADD COLUMN     "data_quality" TEXT,
ADD COLUMN     "resume_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resume_scheduled_for" TIMESTAMP(3),
ADD COLUMN     "stage" TEXT;

-- CreateIndex
CREATE INDEX "experiment_run_status_resume_scheduled_for_idx" ON "experiment_run"("status", "resume_scheduled_for");
