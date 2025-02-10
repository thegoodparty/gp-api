-- AlterTable
ALTER TABLE "campaign_position" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "position" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "race" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "top_issue" ALTER COLUMN "updated_at" DROP DEFAULT;
