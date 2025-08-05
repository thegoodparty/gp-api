/*
  Warnings:

  - The primary key for the `tcr_compliance` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `donation_platform` on the `tcr_compliance` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `tcr_compliance` table. All the data in the column will be lost.
  - You are about to drop the column `website` on the `tcr_compliance` table. All the data in the column will be lost.
  - Added the required column `committee_name` to the `tcr_compliance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `filing_url` to the `tcr_compliance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `website_url` to the `tcr_compliance` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "TcrComplianceStatus" ADD VALUE 'waitingOnPin';

-- AlterTable
ALTER TABLE "tcr_compliance" DROP CONSTRAINT "tcr_compliance_pkey",
DROP COLUMN "donation_platform",
DROP COLUMN "name",
DROP COLUMN "website",
ADD COLUMN     "committee_name" TEXT NOT NULL,
ADD COLUMN     "filing_url" TEXT NOT NULL,
ADD COLUMN     "website_url" TEXT NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "tcr_compliance_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "tcr_compliance_id_seq";
