-- AlterTable
ALTER TABLE "poll_individual_message" ADD COLUMN     "person_cell_phone" TEXT;

-- CreateIndex
CREATE INDEX "poll_individual_message_elected_office_id_poll_id_person_ce_idx" ON "poll_individual_message"("elected_office_id", "poll_id", "person_cell_phone");
