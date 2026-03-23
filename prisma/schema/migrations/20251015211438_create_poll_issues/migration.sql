-- CreateTable
CREATE TABLE "PollIssue" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "representativeComments" JSONB[],
    "response_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PollIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PollIssue_poll_id_id_idx" ON "PollIssue"("poll_id", "id");

-- AddForeignKey
ALTER TABLE "PollIssue" ADD CONSTRAINT "PollIssue_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
