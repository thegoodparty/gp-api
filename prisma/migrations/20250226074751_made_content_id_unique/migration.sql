/*
  Warnings:

  - A unique constraint covering the columns `[content_id]` on the table `blog_article_meta` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "blog_article_meta_content_id_key" ON "blog_article_meta"("content_id");
