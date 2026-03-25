/*
  Warnings:

  - You are about to drop the column `elected_date` on the `elected_office` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `elected_office` table. All the data in the column will be lost.
  - You are about to drop the column `term_end_date` on the `elected_office` table. All the data in the column will be lost.
  - You are about to drop the column `term_length_days` on the `elected_office` table. All the data in the column will be lost.
  - You are about to drop the column `term_start_date` on the `elected_office` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "elected_office" DROP COLUMN "elected_date",
DROP COLUMN "is_active",
DROP COLUMN "term_end_date",
DROP COLUMN "term_length_days",
DROP COLUMN "term_start_date";
