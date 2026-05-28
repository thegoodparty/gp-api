-- Make AnnotationNote.body nullable. Top-level intake notes from the
-- attachments flow (camera/upload) won't have a typed body — only OCR'd text
-- from the attachment.
ALTER TABLE "annotation_note" ALTER COLUMN "body" DROP NOT NULL;
