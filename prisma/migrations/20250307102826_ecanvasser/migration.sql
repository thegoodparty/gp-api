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
CREATE TABLE "ecanvasser_contacts" (
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

    CONSTRAINT "ecanvasser_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_houses" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "unique_identifier" TEXT,
    "external_id" TEXT,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_houses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_interactions" (
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

    CONSTRAINT "ecanvasser_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ecanvasser_campaign_id_key" ON "ecanvasser"("campaign_id");

-- CreateIndex
CREATE INDEX "ecanvasser_campaign_id_idx" ON "ecanvasser"("campaign_id");

-- CreateIndex
CREATE INDEX "ecanvasser_contacts_ecanvasser_id_idx" ON "ecanvasser_contacts"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_houses_ecanvasser_id_idx" ON "ecanvasser_houses"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_interactions_ecanvasser_id_idx" ON "ecanvasser_interactions"("ecanvasser_id");

-- AddForeignKey
ALTER TABLE "ecanvasser" ADD CONSTRAINT "ecanvasser_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_contacts" ADD CONSTRAINT "ecanvasser_contacts_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_contacts" ADD CONSTRAINT "ecanvasser_contacts_ecanvasserHouseId_fkey" FOREIGN KEY ("ecanvasserHouseId") REFERENCES "ecanvasser_houses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_houses" ADD CONSTRAINT "ecanvasser_houses_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_interactions" ADD CONSTRAINT "ecanvasser_interactions_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
