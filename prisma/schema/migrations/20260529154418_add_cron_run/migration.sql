-- CreateTable
CREATE TABLE "cron_run" (
    "id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "run_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cron_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cron_run_job_name_run_date_key" ON "cron_run"("job_name", "run_date");
