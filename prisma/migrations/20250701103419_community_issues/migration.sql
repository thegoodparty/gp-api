-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('inPersonMeeting', 'phoneCall', 'email', 'socialMedia', 'letterMail', 'other');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('inReview', 'inProgress', 'resolved', 'deferred');

-- CreateTable
CREATE TABLE "community_issue" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "Status" NOT NULL,
    "channel" "Channel" NOT NULL,
    "campaignId" INTEGER NOT NULL,

    CONSTRAINT "community_issue_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "community_issue" ADD CONSTRAINT "community_issue_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
