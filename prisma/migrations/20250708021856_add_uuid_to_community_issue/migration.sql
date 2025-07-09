/*
  Warnings:

  - A unique constraint covering the columns `[uuid]` on the table `community_issue` will be added. If there are existing duplicate values, this will fail.
  - The required column `uuid` was added to the `community_issue` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "community_issue" ADD COLUMN     "uuid" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "community_issue_uuid_key" ON "community_issue"("uuid");

-- CreateIndex
CREATE INDEX "community_issue_uuid_idx" ON "community_issue"("uuid");
