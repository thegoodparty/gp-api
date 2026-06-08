-- AlterEnum
ALTER TYPE "AnnotationKind" ADD VALUE 'review';

-- AlterTable
ALTER TABLE "annotation" ADD COLUMN     "annotation_review_id" TEXT;

-- CreateTable
CREATE TABLE "annotation_review" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reviewer_clerk_sub" TEXT NOT NULL,
    "reviewer_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "annotation_review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "annotation_annotation_review_id_key" ON "annotation"("annotation_review_id");

-- AddForeignKey
ALTER TABLE "annotation" ADD CONSTRAINT "annotation_annotation_review_id_fkey" FOREIGN KEY ("annotation_review_id") REFERENCES "annotation_review"("id") ON DELETE SET NULL ON UPDATE CASCADE;
