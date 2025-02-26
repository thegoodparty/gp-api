/*
  Warnings:

  - Added the required column `summary` to the `blog_article_meta` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "blog_article_meta" ADD COLUMN     "summary" TEXT NOT NULL;
