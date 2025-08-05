/*
  Warnings:

  - Added the required column `updated_at` to the `census_entity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `county` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `municipality` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "census_entity" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "county" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "municipality" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
