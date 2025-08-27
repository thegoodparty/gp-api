/*
  Warnings:

  - You are about to drop the column `campaign_timeline` on the `campaign_plan` table. All the data in the column will be lost.
  - You are about to drop the column `know_your_community` on the `campaign_plan` table. All the data in the column will be lost.
  - You are about to drop the column `overview` on the `campaign_plan` table. All the data in the column will be lost.
  - You are about to drop the column `recommended_total_budget` on the `campaign_plan` table. All the data in the column will be lost.
  - You are about to drop the column `strategic_landscape_electoral_goals` on the `campaign_plan` table. All the data in the column will be lost.
  - You are about to drop the column `voter_contact_plan` on the `campaign_plan` table. All the data in the column will be lost.
  - Added the required column `plan` to the `campaign_plan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- First add the column with a default value
ALTER TABLE "campaign_plan" ADD COLUMN "plan" TEXT NOT NULL DEFAULT '';

-- Update existing rows to combine the old columns into the new plan column
UPDATE "campaign_plan" SET "plan" = COALESCE("overview", '') || 
  CASE WHEN "strategic_landscape_electoral_goals" IS NOT NULL THEN E'\n\n' || "strategic_landscape_electoral_goals" ELSE '' END ||
  CASE WHEN "campaign_timeline" IS NOT NULL THEN E'\n\n' || "campaign_timeline" ELSE '' END ||
  CASE WHEN "recommended_total_budget" IS NOT NULL THEN E'\n\n' || "recommended_total_budget" ELSE '' END ||
  CASE WHEN "know_your_community" IS NOT NULL THEN E'\n\n' || "know_your_community" ELSE '' END ||
  CASE WHEN "voter_contact_plan" IS NOT NULL THEN E'\n\n' || "voter_contact_plan" ELSE '' END;

-- Now drop the old columns
ALTER TABLE "campaign_plan" DROP COLUMN "campaign_timeline",
DROP COLUMN "know_your_community",
DROP COLUMN "overview",
DROP COLUMN "recommended_total_budget",
DROP COLUMN "strategic_landscape_electoral_goals",
DROP COLUMN "voter_contact_plan";

-- Remove the default constraint
ALTER TABLE "campaign_plan" ALTER COLUMN "plan" DROP DEFAULT;
