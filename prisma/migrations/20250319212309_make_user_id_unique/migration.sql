/*
  Warnings:

  - A unique constraint covering the columns `[user_id]` on the table `campaign` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "campaign_user_id_key" ON "campaign"("user_id");
