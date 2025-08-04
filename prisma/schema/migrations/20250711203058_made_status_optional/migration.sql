-- AlterTable
ALTER TABLE "tcr_compliance" ALTER COLUMN "status" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'submitted';
