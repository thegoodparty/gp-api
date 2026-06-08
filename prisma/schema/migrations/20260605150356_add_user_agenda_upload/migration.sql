-- CreateEnum
CREATE TYPE "UserAgendaSource" AS ENUM ('URL', 'UPLOAD');

-- CreateTable
CREATE TABLE "user_agenda_upload" (
    "id" TEXT NOT NULL,
    "elected_office_id" TEXT NOT NULL,
    "meeting_date" DATE NOT NULL,
    "source" "UserAgendaSource" NOT NULL,
    "source_url" TEXT,
    "upload_bucket" TEXT,
    "upload_key" TEXT,
    "content_type" TEXT,
    "byte_size" INTEGER,
    "uploaded_by_user_id" INTEGER NOT NULL,
    "experiment_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_agenda_upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_agenda_upload_uploaded_by_user_id_idx" ON "user_agenda_upload"("uploaded_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_agenda_upload_elected_office_id_meeting_date_key" ON "user_agenda_upload"("elected_office_id", "meeting_date");

-- AddForeignKey
ALTER TABLE "user_agenda_upload" ADD CONSTRAINT "user_agenda_upload_elected_office_id_fkey" FOREIGN KEY ("elected_office_id") REFERENCES "elected_office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_agenda_upload" ADD CONSTRAINT "user_agenda_upload_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_agenda_upload" ADD CONSTRAINT "user_agenda_upload_experiment_run_id_fkey" FOREIGN KEY ("experiment_run_id") REFERENCES "experiment_run"("run_id") ON DELETE SET NULL ON UPDATE CASCADE;
