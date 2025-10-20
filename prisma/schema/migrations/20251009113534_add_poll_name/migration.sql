/*
  Warnings:

  - Added the required column `name` to the `Poll` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Poll" ADD COLUMN     "name" TEXT NOT NULL;
