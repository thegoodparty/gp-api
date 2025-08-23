/*
  Warnings:

  - The values [events,education] on the enum `CampaignTaskType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CampaignTaskType_new" AS ENUM ('text', 'robocall', 'doorKnocking', 'phoneBanking', 'socialMedia', 'externalLink', 'general', 'website', 'compliance', 'upgradeToPro', 'profile');
ALTER TABLE "campaign_task" ALTER COLUMN "flow_type" TYPE "CampaignTaskType_new" USING ("flow_type"::text::"CampaignTaskType_new");
ALTER TYPE "CampaignTaskType" RENAME TO "CampaignTaskType_old";
ALTER TYPE "CampaignTaskType_new" RENAME TO "CampaignTaskType";
DROP TYPE "CampaignTaskType_old";
COMMIT;
