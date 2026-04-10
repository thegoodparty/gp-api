-- AlterEnum
ALTER TYPE "CampaignTaskType" ADD VALUE 'awareness';

-- AlterTable
ALTER TABLE "campaign_task" ALTER COLUMN "cta" DROP NOT NULL,
ALTER COLUMN "flow_type" DROP NOT NULL;
