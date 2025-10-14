/*
  Warnings:

  - You are about to drop the column `campaign_id` on the `Poll` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Poll" DROP CONSTRAINT "Poll_campaign_id_fkey";

-- DropIndex
DROP INDEX "Poll_campaign_id_id_idx";

-- AlterTable
ALTER TABLE "Poll" DROP COLUMN "campaign_id",
ADD COLUMN     "elected_office_id" INTEGER;

-- CreateTable
CREATE TABLE "ElectedOffice" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "elected_date" DATE,
    "sworn_in_date" DATE,
    "term_start_date" DATE,
    "term_length_days" INTEGER,
    "term_end_date" DATE,
    "is_active" BOOLEAN NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "campaign_id" INTEGER NOT NULL,

    CONSTRAINT "ElectedOffice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ElectedOffice_public_id_key" ON "ElectedOffice"("public_id");

-- CreateIndex
CREATE INDEX "ElectedOffice_user_id_idx" ON "ElectedOffice"("user_id");

-- CreateIndex
CREATE INDEX "ElectedOffice_campaign_id_idx" ON "ElectedOffice"("campaign_id");

-- CreateIndex
CREATE INDEX "Poll_elected_office_id_id_idx" ON "Poll"("elected_office_id", "id");

-- AddForeignKey
ALTER TABLE "ElectedOffice" ADD CONSTRAINT "ElectedOffice_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectedOffice" ADD CONSTRAINT "ElectedOffice_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_elected_office_id_fkey" FOREIGN KEY ("elected_office_id") REFERENCES "ElectedOffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
