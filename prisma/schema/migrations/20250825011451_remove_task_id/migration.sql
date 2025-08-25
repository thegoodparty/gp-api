/*
  Warnings:

  - You are about to drop the column `task_id` on the `campaign_task` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "campaign_task_task_id_key";

-- AlterTable
ALTER TABLE "campaign_task" DROP COLUMN "task_id";
