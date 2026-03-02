-- This user has two campaigns, which are both marked as pro.
-- They are currently running a campaign with the duopoly and must be removed.
UPDATE "campaign" SET "is_pro" = false WHERE "id" IN (25998, 25997);
