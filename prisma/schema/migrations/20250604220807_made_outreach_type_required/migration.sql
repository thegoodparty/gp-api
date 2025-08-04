/*
  Warnings:

  - You are about to drop the column `outreachType` on the `outreach` table. All the data in the column will be lost.
  - Added the required column `outreach_type` to the `outreach` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "outreach" DROP COLUMN "outreachType",
ADD COLUMN     "outreach_type" "OutreachType" NOT NULL;
