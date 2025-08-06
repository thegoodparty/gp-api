/*
  Warnings:

  - A unique constraint covering the columns `[voter_file_filter_id]` on the table `outreach` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "outreach" ADD COLUMN     "voter_file_filter_id" INTEGER;

-- CreateTable
CREATE TABLE "voter_file_filter" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "audience_super_voters" BOOLEAN DEFAULT false,
    "audience_likely_voters" BOOLEAN DEFAULT false,
    "audience_unreliable_voters" BOOLEAN DEFAULT false,
    "audience_unlikely_voters" BOOLEAN DEFAULT false,
    "audience_first_time_voters" BOOLEAN DEFAULT false,
    "party_independent" BOOLEAN DEFAULT false,
    "party_democrat" BOOLEAN DEFAULT false,
    "party_republican" BOOLEAN DEFAULT false,
    "age_18_25" BOOLEAN DEFAULT false,
    "age_25_35" BOOLEAN DEFAULT false,
    "age_35_50" BOOLEAN DEFAULT false,
    "age_50_plus" BOOLEAN DEFAULT false,
    "gender_male" BOOLEAN DEFAULT false,
    "gender_female" BOOLEAN DEFAULT false,
    "campaign_id" INTEGER NOT NULL,

    CONSTRAINT "voter_file_filter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voter_file_filter_campaign_id_idx" ON "voter_file_filter"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_voter_file_filter_id_key" ON "outreach"("voter_file_filter_id");

-- AddForeignKey
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_voter_file_filter_id_fkey" FOREIGN KEY ("voter_file_filter_id") REFERENCES "voter_file_filter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_file_filter" ADD CONSTRAINT "voter_file_filter_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
