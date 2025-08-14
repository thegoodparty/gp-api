-- CreateEnum
CREATE TYPE "CampaignTaskType" AS ENUM ('text', 'robocall', 'doorKnocking', 'phoneBanking', 'socialMedia', 'events', 'education');

-- CreateTable
CREATE TABLE "campaign_task" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "task_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "flow_type" "CampaignTaskType" NOT NULL,
    "week" INTEGER NOT NULL,
    "link" TEXT,
    "pro_required" BOOLEAN DEFAULT false,
    "deadline" INTEGER,
    "default_ai_template_id" TEXT,
    "campaign_id" INTEGER NOT NULL,

    CONSTRAINT "campaign_task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_task_task_id_key" ON "campaign_task"("task_id");

-- CreateIndex
CREATE INDEX "campaign_task_campaign_id_idx" ON "campaign_task"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_task_campaign_id_week_idx" ON "campaign_task"("campaign_id", "week");

-- AddForeignKey
ALTER TABLE "campaign_task" ADD CONSTRAINT "campaign_task_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
