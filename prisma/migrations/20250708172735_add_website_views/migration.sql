-- CreateTable
CREATE TABLE "website_view" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "website_id" INTEGER NOT NULL,
    "visitor_id" TEXT NOT NULL,

    CONSTRAINT "website_view_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_view_website_id_created_at_idx" ON "website_view"("website_id", "created_at");

-- AddForeignKey
ALTER TABLE "website_view" ADD CONSTRAINT "website_view_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "website"("id") ON DELETE CASCADE ON UPDATE CASCADE;
