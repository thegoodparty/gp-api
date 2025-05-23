/*
  Warnings:

  - You are about to drop the column `imageUrl` on the `outreach` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `outreach` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "outreach" DROP COLUMN "imageUrl",
DROP COLUMN "projectId",
ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "project_id" TEXT;
