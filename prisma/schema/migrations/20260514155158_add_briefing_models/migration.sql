-- CreateEnum
CREATE TYPE "AnnotationKind" AS ENUM ('note', 'chat', 'bug_report');

-- CreateEnum
CREATE TYPE "ChatMessageRole" AS ENUM ('user', 'assistant', 'system', 'tool');

-- CreateTable
CREATE TABLE "annotation" (
    "id" TEXT NOT NULL,
    "author_user_id" INTEGER NOT NULL,
    "kind" "AnnotationKind" NOT NULL,
    "json_path" TEXT,
    "start" INTEGER,
    "end" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "annotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotation_bug_report" (
    "id" TEXT NOT NULL,
    "annotation_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_bug_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotation_note_attachment" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_note_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "briefing_annotation" (
    "annotation_id" TEXT NOT NULL,
    "briefing_id" TEXT NOT NULL,

    CONSTRAINT "briefing_annotation_pkey" PRIMARY KEY ("annotation_id")
);

-- CreateTable
CREATE TABLE "chat_conversation" (
    "id" TEXT NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "annotation_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "ChatMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_briefing" (
    "id" TEXT NOT NULL,
    "elected_office_id" TEXT NOT NULL,
    "meeting_date" DATE NOT NULL,
    "meeting_time" TEXT NOT NULL,
    "meeting_timezone" TEXT NOT NULL,
    "experiment_run_id" TEXT NOT NULL,
    "artifact_bucket" TEXT NOT NULL,
    "artifact_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_briefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note" (
    "id" TEXT NOT NULL,
    "annotation_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "annotation_author_user_id_idx" ON "annotation"("author_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "annotation_bug_report_annotation_id_key" ON "annotation_bug_report"("annotation_id");

-- CreateIndex
CREATE INDEX "annotation_note_attachment_note_id_idx" ON "annotation_note_attachment"("note_id");

-- CreateIndex
CREATE INDEX "briefing_annotation_briefing_id_idx" ON "briefing_annotation"("briefing_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_conversation_annotation_id_key" ON "chat_conversation"("annotation_id");

-- CreateIndex
CREATE INDEX "chat_conversation_owner_user_id_deleted_at_idx" ON "chat_conversation"("owner_user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "chat_message_conversation_id_created_at_idx" ON "chat_message"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "meeting_briefing_elected_office_id_meeting_date_idx" ON "meeting_briefing"("elected_office_id", "meeting_date");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_briefing_elected_office_id_meeting_date_key" ON "meeting_briefing"("elected_office_id", "meeting_date");

-- CreateIndex
CREATE UNIQUE INDEX "note_annotation_id_key" ON "note"("annotation_id");

-- AddForeignKey
ALTER TABLE "annotation" ADD CONSTRAINT "annotation_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_bug_report" ADD CONSTRAINT "annotation_bug_report_annotation_id_fkey" FOREIGN KEY ("annotation_id") REFERENCES "briefing_annotation"("annotation_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_note_attachment" ADD CONSTRAINT "annotation_note_attachment_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "briefing_annotation" ADD CONSTRAINT "briefing_annotation_annotation_id_fkey" FOREIGN KEY ("annotation_id") REFERENCES "annotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "briefing_annotation" ADD CONSTRAINT "briefing_annotation_briefing_id_fkey" FOREIGN KEY ("briefing_id") REFERENCES "meeting_briefing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversation" ADD CONSTRAINT "chat_conversation_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversation" ADD CONSTRAINT "chat_conversation_annotation_id_fkey" FOREIGN KEY ("annotation_id") REFERENCES "annotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_briefing" ADD CONSTRAINT "meeting_briefing_elected_office_id_fkey" FOREIGN KEY ("elected_office_id") REFERENCES "elected_office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_briefing" ADD CONSTRAINT "meeting_briefing_experiment_run_id_fkey" FOREIGN KEY ("experiment_run_id") REFERENCES "experiment_run"("run_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_annotation_id_fkey" FOREIGN KEY ("annotation_id") REFERENCES "annotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
