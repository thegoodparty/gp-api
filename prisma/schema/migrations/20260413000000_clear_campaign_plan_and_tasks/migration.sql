-- Clear all campaign tasks and campaign plans for a clean slate.
-- Campaign tasks will be regenerated when users visit their dashboard.
TRUNCATE TABLE "campaign_task" CASCADE;
TRUNCATE TABLE "campaign_plan" CASCADE;
