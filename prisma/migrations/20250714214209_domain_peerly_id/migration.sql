/*
  Warnings:

  - You are about to drop the column `website_url` on the `tcr_compliance` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[peerly_identity_id]` on the table `tcr_compliance` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `website_domain` to the `tcr_compliance` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "tcr_compliance" DROP COLUMN "website_url",
ADD COLUMN     "peerly_identity_id" TEXT,
ADD COLUMN     "website_domain" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tcr_compliance_peerly_identity_id_key" ON "tcr_compliance"("peerly_identity_id");
