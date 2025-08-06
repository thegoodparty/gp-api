/*
  Warnings:

  - The primary key for the `County` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `County` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Municipality` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Municipality` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `countyId` column on the `Municipality` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Race` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Race` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `countyId` column on the `Race` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `municipalityId` column on the `Race` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropForeignKey
ALTER TABLE "Municipality" DROP CONSTRAINT "Municipality_countyId_fkey";

-- DropForeignKey
ALTER TABLE "Race" DROP CONSTRAINT "Race_countyId_fkey";

-- DropForeignKey
ALTER TABLE "Race" DROP CONSTRAINT "Race_municipalityId_fkey";

-- AlterTable
ALTER TABLE "County" DROP CONSTRAINT "County_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "County_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Municipality" DROP CONSTRAINT "Municipality_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "countyId",
ADD COLUMN     "countyId" INTEGER,
ADD CONSTRAINT "Municipality_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Race" DROP CONSTRAINT "Race_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "countyId",
ADD COLUMN     "countyId" INTEGER,
DROP COLUMN "municipalityId",
ADD COLUMN     "municipalityId" INTEGER,
ADD CONSTRAINT "Race_pkey" PRIMARY KEY ("id");

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_countyId_fkey" FOREIGN KEY ("countyId") REFERENCES "County"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Municipality" ADD CONSTRAINT "Municipality_countyId_fkey" FOREIGN KEY ("countyId") REFERENCES "County"("id") ON DELETE SET NULL ON UPDATE CASCADE;
