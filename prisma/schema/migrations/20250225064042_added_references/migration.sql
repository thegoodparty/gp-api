-- AlterTable
ALTER TABLE "blog_article_meta" ADD COLUMN     "references" JSONB NOT NULL DEFAULT '[]';
