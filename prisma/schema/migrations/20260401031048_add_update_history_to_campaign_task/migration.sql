/*
  Warnings:

  - A unique constraint covering the columns `[update_history_id]` on the table `campaign_task` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "campaign_task" ADD COLUMN     "update_history_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "campaign_task_update_history_id_key" ON "campaign_task"("update_history_id");

-- AddForeignKey
ALTER TABLE "campaign_task" ADD CONSTRAINT "campaign_task_update_history_id_fkey" FOREIGN KEY ("update_history_id") REFERENCES "campaign_update_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;
