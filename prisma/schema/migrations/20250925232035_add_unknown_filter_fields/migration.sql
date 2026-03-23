-- AlterTable
ALTER TABLE "voter_file_filter" ADD COLUMN     "age_unknown" BOOLEAN DEFAULT false,
ADD COLUMN     "party_unknown" BOOLEAN DEFAULT false;
