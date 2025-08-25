/*
  Warnings:

  - The primary key for the `campaign_task` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropIndex
DROP INDEX "campaign_task_campaign_id_week_idx";

-- AlterTable
ALTER TABLE "campaign_task" DROP CONSTRAINT "campaign_task_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "campaign_task_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "campaign_task_id_seq";
