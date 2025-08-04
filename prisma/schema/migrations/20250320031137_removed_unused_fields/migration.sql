/*
  Warnings:

  - You are about to drop the column `external_id` on the `ecanvasser_house` table. All the data in the column will be lost.
  - You are about to drop the column `unique_identifier` on the `ecanvasser_house` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ecanvasser_house" DROP COLUMN "external_id",
DROP COLUMN "unique_identifier";
