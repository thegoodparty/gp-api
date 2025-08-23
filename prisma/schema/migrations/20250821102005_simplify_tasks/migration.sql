/*
  Warnings:

  - You are about to drop the column `deadline` on the `campaign_task` table. All the data in the column will be lost.
  - You are about to drop the column `default_ai_template_id` on the `campaign_task` table. All the data in the column will be lost.
  - You are about to drop the column `pro_required` on the `campaign_task` table. All the data in the column will be lost.
  - You are about to drop the column `week` on the `campaign_task` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "campaign_task_campaign_id_week_idx";

-- AlterTable
ALTER TABLE "campaign_task" DROP COLUMN "deadline",
DROP COLUMN "default_ai_template_id",
DROP COLUMN "pro_required",
DROP COLUMN "week";
