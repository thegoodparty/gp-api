-- AlterTable
ALTER TABLE "voter_file_filter" ADD COLUMN     "has_cell_phone" BOOLEAN DEFAULT false,
ADD COLUMN     "has_landline" BOOLEAN DEFAULT false;
