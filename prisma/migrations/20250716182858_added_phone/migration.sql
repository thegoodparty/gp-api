/*
  Warnings:

  - Added the required column `phone` to the `tcr_compliance` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "tcr_compliance" ADD COLUMN     "phone" TEXT NOT NULL;
