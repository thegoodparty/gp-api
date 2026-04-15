-- CreateEnum
CREATE TYPE "ExperimentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CONTRACT_VIOLATION');

-- CreateTable
CREATE TABLE "experiment_run" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "status" "ExperimentRunStatus" NOT NULL DEFAULT 'PENDING',
    "params" JSONB NOT NULL DEFAULT '{}',
    "artifact_bucket" TEXT,
    "artifact_key" TEXT,
    "duration_seconds" DOUBLE PRECISION,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiment_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "experiment_run_run_id_key" ON "experiment_run"("run_id");

-- CreateIndex
CREATE INDEX "experiment_run_experiment_id_idx" ON "experiment_run"("experiment_id");

-- CreateIndex
CREATE INDEX "experiment_run_candidate_id_idx" ON "experiment_run"("candidate_id");

-- CreateIndex
CREATE INDEX "experiment_run_status_idx" ON "experiment_run"("status");
