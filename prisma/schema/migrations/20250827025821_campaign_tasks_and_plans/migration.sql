/*
  Warnings:

  - You are about to drop the column `completed_task_ids` on the `campaign` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "CampaignTaskType" AS ENUM ('text', 'robocall', 'doorKnocking', 'phoneBanking', 'socialMedia', 'events', 'education', 'compliance');

-- AlterTable
ALTER TABLE "campaign" DROP COLUMN "completed_task_ids";

-- CreateTable
CREATE TABLE "campaign_plan" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "campaign_info_hash" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "raw_json" JSONB,
    "campaign_id" INTEGER NOT NULL,

    CONSTRAINT "campaign_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_task" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "flow_type" "CampaignTaskType" NOT NULL,
    "week" INTEGER NOT NULL,
    "date" TIMESTAMP(3),
    "link" TEXT,
    "pro_required" BOOLEAN DEFAULT false,
    "is_default_task" BOOLEAN DEFAULT false,
    "deadline" INTEGER,
    "default_ai_template_id" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "campaign_id" INTEGER NOT NULL,

    CONSTRAINT "campaign_task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_plan_campaign_id_key" ON "campaign_plan"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_task_campaign_id_idx" ON "campaign_task"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_task_campaign_id_completed_idx" ON "campaign_task"("campaign_id", "completed");

-- AddForeignKey
ALTER TABLE "campaign_plan" ADD CONSTRAINT "campaign_plan_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_task" ADD CONSTRAINT "campaign_task_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
