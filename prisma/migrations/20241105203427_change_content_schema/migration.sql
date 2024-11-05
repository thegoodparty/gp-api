/*
  Warnings:

  - The primary key for the `Content` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `createdAt` on the `Content` table. All the data in the column will be lost.
  - You are about to drop the column `key` on the `Content` table. All the data in the column will be lost.
  - You are about to drop the column `subKey` on the `Content` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Content` table. All the data in the column will be lost.
  - Added the required column `created_at` to the `Content` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Content` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Content` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Content" DROP CONSTRAINT "Content_pkey",
DROP COLUMN "createdAt",
DROP COLUMN "key",
DROP COLUMN "subKey",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" BIGINT NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "updated_at" BIGINT NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Content_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Content_id_seq";
