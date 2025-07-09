/*
  Warnings:

  - The primary key for the `community_issue` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `community_issue` table. All the data in the column will be lost.
  - You are about to drop the column `community_issue_id` on the `community_issue_status_log` table. All the data in the column will be lost.
  - Added the required column `community_issue_uuid` to the `community_issue_status_log` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "community_issue_status_log" DROP CONSTRAINT "community_issue_status_log_community_issue_id_fkey";

-- DropIndex
DROP INDEX "community_issue_uuid_idx";

-- DropIndex
DROP INDEX "community_issue_uuid_key";

-- AlterTable
ALTER TABLE "community_issue" DROP CONSTRAINT "community_issue_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "community_issue_pkey" PRIMARY KEY ("uuid");

-- AlterTable
ALTER TABLE "community_issue_status_log" DROP COLUMN "community_issue_id",
ADD COLUMN     "community_issue_uuid" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "community_issue_status_log" ADD CONSTRAINT "community_issue_status_log_community_issue_uuid_fkey" FOREIGN KEY ("community_issue_uuid") REFERENCES "community_issue"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
