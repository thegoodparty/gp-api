-- CreateTable
CREATE TABLE "website_contact" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "website_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "sms_consent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "website_contact_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "website_contact" ADD CONSTRAINT "website_contact_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "website"("id") ON DELETE CASCADE ON UPDATE CASCADE;
