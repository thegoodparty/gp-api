/*
  Warnings:

  - Added the required column `section` to the `blog_article_meta` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "blog_article_meta" ADD COLUMN     "section" JSONB NOT NULL,
ALTER COLUMN "tags" SET DEFAULT '[]';
