/*
  Warnings:

  - You are about to drop the column `age_18_25` on the `outreach` table. All the data in the column will be lost.
  - You are about to drop the column `age_25_35` on the `outreach` table. All the data in the column will be lost.
  - You are about to drop the column `age_35_50` on the `outreach` table. All the data in the column will be lost.
  - You are about to drop the column `age_50_plus` on the `outreach` table. All the data in the column will be lost.
  - You are about to drop the column `audience_firstTimeVoters` on the `outreach` table. All the data in the column will be lost.
  - You are about to drop the column `audience_likelyVoters` on the `outreach` table. All the data in the column will be lost.
  - You are about to drop the column `audience_superVoters` on the `outreach` table. All the data in the column will be lost.
  - You are about to drop the column `audience_unlikelyVoters` on the `outreach` table. All the data in the column will be lost.
  - You are about to drop the column `audience_unreliableVoters` on the `outreach` table. All the data in the column will be lost.
  - You are about to drop the column `gender_female` on the `outreach` table. All the data in the column will be lost.
  - You are about to drop the column `gender_male` on the `outreach` table. All the data in the column will be lost.
  - You are about to drop the column `gender_unknown` on the `outreach` table. All the data in the column will be lost.
  - You are about to drop the column `party_democrat` on the `outreach` table. All the data in the column will be lost.
  - You are about to drop the column `party_independent` on the `outreach` table. All the data in the column will be lost.
  - You are about to drop the column `party_republican` on the `outreach` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "outreach" DROP COLUMN "age_18_25",
DROP COLUMN "age_25_35",
DROP COLUMN "age_35_50",
DROP COLUMN "age_50_plus",
DROP COLUMN "audience_firstTimeVoters",
DROP COLUMN "audience_likelyVoters",
DROP COLUMN "audience_superVoters",
DROP COLUMN "audience_unlikelyVoters",
DROP COLUMN "audience_unreliableVoters",
DROP COLUMN "gender_female",
DROP COLUMN "gender_male",
DROP COLUMN "gender_unknown",
DROP COLUMN "party_democrat",
DROP COLUMN "party_independent",
DROP COLUMN "party_republican";
