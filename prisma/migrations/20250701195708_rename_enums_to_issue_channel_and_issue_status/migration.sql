/*
  Warnings:

  - Renamed enum `Channel` to `IssueChannel`
  - Renamed enum `Status` to `IssueStatus`

*/

-- CreateEnum (new enums with same values)
CREATE TYPE "IssueChannel" AS ENUM ('inPersonMeeting', 'phoneCall', 'email', 'socialMedia', 'letterMail', 'other');
CREATE TYPE "IssueStatus" AS ENUM ('newIssue', 'accepted', 'inProgress', 'wontDo', 'completed');

-- Add temporary columns with new enum types
ALTER TABLE "community_issue" ADD COLUMN "channel_new" "IssueChannel";
ALTER TABLE "community_issue" ADD COLUMN "status_new" "IssueStatus";

-- Copy data from old columns to new columns, casting the enum values
UPDATE "community_issue" SET "channel_new" = "channel"::text::"IssueChannel";
UPDATE "community_issue" SET "status_new" = "status"::text::"IssueStatus";

-- Make the new columns NOT NULL (they should all have values now)
ALTER TABLE "community_issue" ALTER COLUMN "channel_new" SET NOT NULL;
ALTER TABLE "community_issue" ALTER COLUMN "status_new" SET NOT NULL;

-- Drop the old columns
ALTER TABLE "community_issue" DROP COLUMN "channel";
ALTER TABLE "community_issue" DROP COLUMN "status";

-- Rename the new columns to the original names
ALTER TABLE "community_issue" RENAME COLUMN "channel_new" TO "channel";
ALTER TABLE "community_issue" RENAME COLUMN "status_new" TO "status";

-- Drop the old enum types
DROP TYPE "Channel";
DROP TYPE "Status";
