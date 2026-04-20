-- CreateEnum
CREATE TYPE "ExperimentRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "experiment_run" (
    "run_id" TEXT NOT NULL,
    "organization_slug" TEXT NOT NULL,
    "experiment_type" TEXT NOT NULL,
    "status" "ExperimentRunStatus" NOT NULL DEFAULT 'RUNNING',
    "params" JSONB NOT NULL DEFAULT '{}',
    "artifact_bucket" TEXT,
    "artifact_key" TEXT,
    "duration_seconds" DOUBLE PRECISION,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "experiment_run_run_id_key" ON "experiment_run"("run_id");

-- CreateIndex
CREATE INDEX "experiment_run_organization_slug_experiment_type_idx" ON "experiment_run"("organization_slug", "experiment_type");

-- AddForeignKey
ALTER TABLE "experiment_run" ADD CONSTRAINT "experiment_run_organization_slug_fkey" FOREIGN KEY ("organization_slug") REFERENCES "organization"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
