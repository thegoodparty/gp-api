-- CreateEnum
CREATE TYPE "MatchingContactFieldType" AS ENUM ('email', 'postalAddress', 'phone');

-- AlterTable
ALTER TABLE "tcr_compliance" ADD COLUMN     "matching_contact_fields" "MatchingContactFieldType"[];
