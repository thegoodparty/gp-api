-- CreateTable
CREATE TABLE "ecanvasser" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "api_key" TEXT NOT NULL,
    "campaign_id" INTEGER NOT NULL,
    "last_sync" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "ecanvasser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_contact" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "gender" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "year_of_birth" TEXT,
    "house_id" INTEGER,
    "unique_identifier" TEXT,
    "organization" TEXT,
    "volunteer" BOOLEAN NOT NULL DEFAULT false,
    "deceased" BOOLEAN NOT NULL DEFAULT false,
    "donor" BOOLEAN NOT NULL DEFAULT false,
    "home_phone" TEXT,
    "mobile_phone" TEXT,
    "email" TEXT,
    "action_id" INTEGER,
    "last_interaction_id" INTEGER,
    "created_by" INTEGER NOT NULL,
    "ecanvasser_id" INTEGER NOT NULL,
    "ecanvasserHouseId" INTEGER,

    CONSTRAINT "ecanvasser_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_house" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "unique_identifier" TEXT,
    "external_id" TEXT,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_house_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_interaction" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "contact_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "notes" TEXT,
    "source" TEXT,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_interaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ecanvasser_campaign_id_key" ON "ecanvasser"("campaign_id");

-- CreateIndex
CREATE INDEX "ecanvasser_campaign_id_idx" ON "ecanvasser"("campaign_id");

-- CreateIndex
CREATE INDEX "ecanvasser_contact_ecanvasser_id_idx" ON "ecanvasser_contact"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_house_ecanvasser_id_idx" ON "ecanvasser_house"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_interaction_ecanvasser_id_idx" ON "ecanvasser_interaction"("ecanvasser_id");

-- AddForeignKey
ALTER TABLE "ecanvasser" ADD CONSTRAINT "ecanvasser_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_contact" ADD CONSTRAINT "ecanvasser_contact_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_contact" ADD CONSTRAINT "ecanvasser_contact_ecanvasserHouseId_fkey" FOREIGN KEY ("ecanvasserHouseId") REFERENCES "ecanvasser_house"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_house" ADD CONSTRAINT "ecanvasser_house_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_interaction" ADD CONSTRAINT "ecanvasser_interaction_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
