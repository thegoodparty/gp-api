-- AlterTable
ALTER TABLE "campaign_task" ADD COLUMN     "completed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "campaign_task_campaign_id_completed_idx" ON "campaign_task"("campaign_id", "completed");
