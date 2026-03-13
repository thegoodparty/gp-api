-- AlterTable
ALTER TABLE "voter_file_filter" ADD COLUMN     "organization_slug" TEXT;

-- CreateIndex
CREATE INDEX "voter_file_filter_organization_slug_idx" ON "voter_file_filter"("organization_slug");

-- AddForeignKey
ALTER TABLE "voter_file_filter" ADD CONSTRAINT "voter_file_filter_organization_slug_fkey" FOREIGN KEY ("organization_slug") REFERENCES "organization"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
