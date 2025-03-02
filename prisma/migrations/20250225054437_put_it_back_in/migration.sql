/*
  Warnings:

  - Added the required column `main_image` to the `blog_article_meta` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "blog_article_meta" ADD COLUMN     "main_image" JSONB NOT NULL;
