-- AlterTable
ALTER TABLE "voter_file_filter" ADD COLUMN     "audience_unknown" BOOLEAN DEFAULT false,
ADD COLUMN     "income_unknown" BOOLEAN DEFAULT false,
ADD COLUMN     "registered_voter_unknown" BOOLEAN DEFAULT false;
