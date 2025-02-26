/*
  Warnings:

  - Added the required column `author` to the `blog_article_meta` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "blog_article_meta" ADD COLUMN     "author" JSONB NOT NULL;
