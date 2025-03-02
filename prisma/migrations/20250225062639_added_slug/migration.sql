/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `blog_article_meta` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `slug` to the `blog_article_meta` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "blog_article_meta" ADD COLUMN     "slug" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "blog_article_meta_slug_key" ON "blog_article_meta"("slug");
