/*
  Warnings:

  - The `error` column on the `scheduled_message` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "scheduled_message" DROP COLUMN "error",
ADD COLUMN     "error" BOOLEAN;
