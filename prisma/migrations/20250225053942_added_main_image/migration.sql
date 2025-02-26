/*
  Warnings:

  - Added the required column `main_image` to the `blog_article_meta` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "blog_article_meta" ADD COLUMN     "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "main_image" JSONB NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3);
