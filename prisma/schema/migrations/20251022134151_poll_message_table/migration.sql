-- CreateTable
CREATE TABLE "poll_individual_message" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_individual_message_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "poll_individual_message" ADD CONSTRAINT "poll_individual_message_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
