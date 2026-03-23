/*
  Warnings:

  - The primary key for the `Poll` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `confidence` column on the `Poll` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `estimatedCompletionDate` to the `Poll` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PollConfidence" AS ENUM ('LOW', 'HIGH');

-- AlterTable
ALTER TABLE "Poll" DROP CONSTRAINT "Poll_pkey",
ADD COLUMN     "estimatedCompletionDate" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "completed_date" DROP NOT NULL,
DROP COLUMN "confidence",
ADD COLUMN     "confidence" "PollConfidence",
ADD CONSTRAINT "Poll_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Poll_id_seq";
