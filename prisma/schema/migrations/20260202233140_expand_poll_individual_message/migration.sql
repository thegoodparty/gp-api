-- CreateEnum
CREATE TYPE "PollIndividualMessageSender" AS ENUM ('ELECTED_OFFICIAL', 'CONSTITUENT');

-- AlterTable
ALTER TABLE "poll_individual_message" ADD COLUMN     "content" TEXT,
ADD COLUMN     "elected_office_id" TEXT,
ADD COLUMN     "is_opt_out" BOOLEAN,
ADD COLUMN     "sender" "PollIndividualMessageSender" NOT NULL DEFAULT 'ELECTED_OFFICIAL';

-- CreateTable
CREATE TABLE "_PollIndividualMessageToPollIssue" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PollIndividualMessageToPollIssue_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_PollIndividualMessageToPollIssue_B_index" ON "_PollIndividualMessageToPollIssue"("B");

-- CreateIndex
CREATE INDEX "poll_individual_message_elected_office_id_person_id_sent_at_idx" ON "poll_individual_message"("elected_office_id", "person_id", "sent_at");

-- AddForeignKey
ALTER TABLE "poll_individual_message" ADD CONSTRAINT "poll_individual_message_elected_office_id_fkey" FOREIGN KEY ("elected_office_id") REFERENCES "elected_office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PollIndividualMessageToPollIssue" ADD CONSTRAINT "_PollIndividualMessageToPollIssue_A_fkey" FOREIGN KEY ("A") REFERENCES "poll_individual_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PollIndividualMessageToPollIssue" ADD CONSTRAINT "_PollIndividualMessageToPollIssue_B_fkey" FOREIGN KEY ("B") REFERENCES "poll_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
