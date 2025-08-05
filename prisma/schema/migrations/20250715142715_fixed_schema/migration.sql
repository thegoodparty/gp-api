/*
  Warnings:

  - You are about to drop the column `pin` on the `tcr_compliance` table. All the data in the column will be lost.
  - Made the column `campaign_id` on table `tcr_compliance` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "tcr_compliance" DROP COLUMN "pin",
ALTER COLUMN "campaign_id" SET NOT NULL;
