/*
  Warnings:

  - A unique constraint covering the columns `[vanity_path]` on the table `website` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `vanity_path` to the `website` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "WebsiteStatus" AS ENUM ('published', 'unpublished');

-- AlterTable
ALTER TABLE "website" ADD COLUMN     "content" JSONB DEFAULT '{}',
ADD COLUMN     "status" "WebsiteStatus" NOT NULL DEFAULT 'unpublished',
ADD COLUMN     "vanity_path" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "website_vanity_path_key" ON "website"("vanity_path");
