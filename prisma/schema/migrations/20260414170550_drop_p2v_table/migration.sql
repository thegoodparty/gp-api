/*
  Warnings:

  - You are about to drop the `path_to_victory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "path_to_victory" DROP CONSTRAINT "path_to_victory_campaign_id_fkey";

-- DropTable
DROP TABLE "path_to_victory";
