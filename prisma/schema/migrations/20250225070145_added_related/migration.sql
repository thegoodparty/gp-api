-- AlterTable
ALTER TABLE "blog_article_meta" ADD COLUMN     "related_article_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
