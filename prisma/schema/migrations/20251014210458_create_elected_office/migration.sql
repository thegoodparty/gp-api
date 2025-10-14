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
CREATE TABLE "elected_office" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "elected_date" DATE,
    "sworn_in_date" DATE,
    "term_start_date" DATE,
    "term_length_days" INTEGER,
    "term_end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "campaign_id" INTEGER NOT NULL,

    CONSTRAINT "elected_office_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "elected_office_public_id_key" ON "elected_office"("public_id");

-- CreateIndex
CREATE INDEX "elected_office_user_id_idx" ON "elected_office"("user_id");

-- CreateIndex
CREATE INDEX "elected_office_campaign_id_idx" ON "elected_office"("campaign_id");

-- CreateIndex
CREATE INDEX "Poll_elected_office_id_id_idx" ON "Poll"("elected_office_id", "id");

-- AddForeignKey
ALTER TABLE "elected_office" ADD CONSTRAINT "elected_office_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elected_office" ADD CONSTRAINT "elected_office_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_elected_office_id_fkey" FOREIGN KEY ("elected_office_id") REFERENCES "elected_office"("id") ON DELETE CASCADE ON UPDATE CASCADE;
