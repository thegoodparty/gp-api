-- OCR pipeline groundwork for attachment-bearing notes (camera / upload).
-- Each attachment goes through OCR (or skip, for plain text) and the
-- extracted text becomes part of the note's effective content.
CREATE TYPE "OcrStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'skipped');

ALTER TABLE "annotation_note_attachment"
  ADD COLUMN "ocr_status" "OcrStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "ocr_text" TEXT,
  ADD COLUMN "ocr_error" TEXT,
  ADD COLUMN "ocr_completed_at" TIMESTAMP(3);

-- The composite index below serves noteId-only lookups via its leading
-- column, so drop the standalone noteId index to avoid duplicate maintenance.
DROP INDEX "annotation_note_attachment_note_id_idx";

CREATE INDEX "annotation_note_attachment_note_id_ocr_status_idx"
  ON "annotation_note_attachment" ("note_id", "ocr_status");
