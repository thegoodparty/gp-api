/*
  Warnings:

  - Added the required column `targetAudienceSize` to the `Poll` table without a default value. This is not possible if the table is not empty.
  - Made the column `completed_date` on table `Poll` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Poll" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "targetAudienceSize" INTEGER NOT NULL,
ALTER COLUMN "completed_date" SET NOT NULL;
