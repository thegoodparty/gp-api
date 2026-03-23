/*
  Warnings:

  - You are about to drop the `Poll` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Poll" DROP CONSTRAINT "Poll_elected_office_id_fkey";

-- DropTable
DROP TABLE "Poll";

-- CreateTable
CREATE TABLE "poll" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PollStatus" NOT NULL,
    "message_content" TEXT NOT NULL,
    "image_url" TEXT,
    "targetAudienceSize" INTEGER NOT NULL,
    "confidence" "PollConfidence",
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "estimatedCompletionDate" TIMESTAMP(3) NOT NULL,
    "completed_date" TIMESTAMP(3),
    "elected_office_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "poll_elected_office_id_id_idx" ON "poll"("elected_office_id", "id");

-- AddForeignKey
ALTER TABLE "poll" ADD CONSTRAINT "poll_elected_office_id_fkey" FOREIGN KEY ("elected_office_id") REFERENCES "elected_office"("id") ON DELETE CASCADE ON UPDATE CASCADE;
