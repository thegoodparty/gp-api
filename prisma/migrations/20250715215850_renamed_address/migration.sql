/*
  Warnings:

  - You are about to drop the column `address` on the `tcr_compliance` table. All the data in the column will be lost.
  - Added the required column `postalAddress` to the `tcr_compliance` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "tcr_compliance" DROP COLUMN "address",
ADD COLUMN     "postalAddress" TEXT NOT NULL;
