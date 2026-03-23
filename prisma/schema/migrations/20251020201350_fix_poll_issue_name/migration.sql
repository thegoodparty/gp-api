/*
  Warnings:

  - You are about to drop the `PollIssue` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PollIssue" DROP CONSTRAINT "PollIssue_poll_id_fkey";

-- DropTable
DROP TABLE "PollIssue";

-- CreateTable
CREATE TABLE "poll_issues" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "representativeComments" JSONB[],
    "response_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "poll_issues_poll_id_id_idx" ON "poll_issues"("poll_id", "id");

-- AddForeignKey
ALTER TABLE "poll_issues" ADD CONSTRAINT "poll_issues_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
