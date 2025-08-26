-- AlterEnum
ALTER TYPE "OutreachType" ADD VALUE 'p2p';

-- AlterTable
ALTER TABLE "outreach" ADD COLUMN     "did_state" TEXT,
ADD COLUMN     "identity_id" TEXT,
ADD COLUMN     "phone_list_id" INTEGER,
ADD COLUMN     "title" TEXT;
