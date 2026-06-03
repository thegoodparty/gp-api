-- AlterTable
ALTER TABLE "campaign_strategy" ADD COLUMN     "opportunities_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "opposition_attempts" INTEGER NOT NULL DEFAULT 0;
