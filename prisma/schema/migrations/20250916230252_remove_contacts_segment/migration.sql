/*
  Warnings:

  - You are about to drop the `contacts_segment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "contacts_segment" DROP CONSTRAINT "contacts_segment_campaign_id_fkey";

-- DropTable
DROP TABLE "contacts_segment";
