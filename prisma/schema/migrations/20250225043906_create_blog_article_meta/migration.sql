-- CreateTable
CREATE TABLE "blog_article_meta" (
    "id" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,

    CONSTRAINT "blog_article_meta_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "blog_article_meta" ADD CONSTRAINT "blog_article_meta_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
