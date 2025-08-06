-- DropForeignKey
ALTER TABLE "domain" DROP CONSTRAINT "domain_website_id_fkey";

-- AddForeignKey
ALTER TABLE "domain" ADD CONSTRAINT "domain_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "website"("id") ON DELETE CASCADE ON UPDATE CASCADE;
