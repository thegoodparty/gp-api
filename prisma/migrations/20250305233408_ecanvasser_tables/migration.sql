/*
  Warnings:

  - You are about to drop the column `appointments` on the `ecanvasser` table. All the data in the column will be lost.
  - You are about to drop the column `contacts` on the `ecanvasser` table. All the data in the column will be lost.
  - You are about to drop the column `custom_fields` on the `ecanvasser` table. All the data in the column will be lost.
  - You are about to drop the column `documents` on the `ecanvasser` table. All the data in the column will be lost.
  - You are about to drop the column `efforts` on the `ecanvasser` table. All the data in the column will be lost.
  - You are about to drop the column `follow_ups` on the `ecanvasser` table. All the data in the column will be lost.
  - You are about to drop the column `houses` on the `ecanvasser` table. All the data in the column will be lost.
  - You are about to drop the column `interactions` on the `ecanvasser` table. All the data in the column will be lost.
  - You are about to drop the column `questions` on the `ecanvasser` table. All the data in the column will be lost.
  - You are about to drop the column `surveys` on the `ecanvasser` table. All the data in the column will be lost.
  - You are about to drop the column `teams` on the `ecanvasser` table. All the data in the column will be lost.
  - You are about to drop the column `users` on the `ecanvasser` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ecanvasser" DROP COLUMN "appointments",
DROP COLUMN "contacts",
DROP COLUMN "custom_fields",
DROP COLUMN "documents",
DROP COLUMN "efforts",
DROP COLUMN "follow_ups",
DROP COLUMN "houses",
DROP COLUMN "interactions",
DROP COLUMN "questions",
DROP COLUMN "surveys",
DROP COLUMN "teams",
DROP COLUMN "users";

-- CreateTable
CREATE TABLE "ecanvasser_appointments" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3),
    "status" TEXT DEFAULT 'Active',
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "assigned_to" INTEGER NOT NULL,
    "canvass_id" INTEGER NOT NULL,
    "contact_id" INTEGER NOT NULL,
    "house_id" INTEGER NOT NULL,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_appointments_pkey" PRIMARY KEY ("id")
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
    "yearOfBirth" INTEGER,
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

    CONSTRAINT "ecanvasser_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_custom_fields" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "type_id" INTEGER NOT NULL,
    "type_name" TEXT NOT NULL,
    "default_value" TEXT,
    "nationbuilder_slug" TEXT,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_documents" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "file_name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "file_size" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_efforts" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "icon" TEXT NOT NULL,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_efforts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_follow_ups" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "details" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'None',
    "status" TEXT NOT NULL DEFAULT 'New',
    "origin" TEXT NOT NULL,
    "contact_id" INTEGER NOT NULL,
    "interaction_id" INTEGER,
    "assigned_to" INTEGER,
    "created_by" INTEGER NOT NULL,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_houses" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "unit" TEXT,
    "number" TEXT,
    "name" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "location_type" TEXT,
    "last_interaction_id" INTEGER,
    "action_id" INTEGER,
    "building_id" INTEGER,
    "type" TEXT NOT NULL,
    "zip_code" TEXT,
    "precinct" TEXT,
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_houses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_interactions" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "rating" INTEGER,
    "status_id" INTEGER NOT NULL,
    "status_name" TEXT NOT NULL,
    "status_description" TEXT NOT NULL,
    "status_color" TEXT NOT NULL,
    "effort_id" INTEGER NOT NULL,
    "contactId" INTEGER,
    "houseId" INTEGER,
    "type" TEXT NOT NULL,
    "action_id" INTEGER,
    "created_by" INTEGER NOT NULL,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_surveys" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requires_signature" BOOLEAN NOT NULL DEFAULT false,
    "nationbuilder_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Not Live',
    "team_id" INTEGER,
    "created_by" INTEGER NOT NULL,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_questions" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "survey_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "answer_type_id" INTEGER NOT NULL,
    "answer_type_name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_teams" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_users" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "email" TEXT,
    "phone_number" TEXT,
    "country_code" TEXT,
    "joined" TIMESTAMP(3) NOT NULL,
    "billing" BOOLEAN NOT NULL DEFAULT false,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ecanvasser_appointments_ecanvasser_id_idx" ON "ecanvasser_appointments"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_contacts_ecanvasser_id_idx" ON "ecanvasser_contacts"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_custom_fields_ecanvasser_id_idx" ON "ecanvasser_custom_fields"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_documents_ecanvasser_id_idx" ON "ecanvasser_documents"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_efforts_ecanvasser_id_idx" ON "ecanvasser_efforts"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_follow_ups_ecanvasser_id_idx" ON "ecanvasser_follow_ups"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_houses_ecanvasser_id_idx" ON "ecanvasser_houses"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_interactions_ecanvasser_id_idx" ON "ecanvasser_interactions"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_surveys_ecanvasser_id_idx" ON "ecanvasser_surveys"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_questions_ecanvasser_id_idx" ON "ecanvasser_questions"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_teams_ecanvasser_id_idx" ON "ecanvasser_teams"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_users_ecanvasser_id_idx" ON "ecanvasser_users"("ecanvasser_id");

-- AddForeignKey
ALTER TABLE "ecanvasser_appointments" ADD CONSTRAINT "ecanvasser_appointments_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_contacts" ADD CONSTRAINT "ecanvasser_contacts_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_custom_fields" ADD CONSTRAINT "ecanvasser_custom_fields_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_documents" ADD CONSTRAINT "ecanvasser_documents_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_efforts" ADD CONSTRAINT "ecanvasser_efforts_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_follow_ups" ADD CONSTRAINT "ecanvasser_follow_ups_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_houses" ADD CONSTRAINT "ecanvasser_houses_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_interactions" ADD CONSTRAINT "ecanvasser_interactions_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_surveys" ADD CONSTRAINT "ecanvasser_surveys_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_questions" ADD CONSTRAINT "ecanvasser_questions_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_teams" ADD CONSTRAINT "ecanvasser_teams_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_users" ADD CONSTRAINT "ecanvasser_users_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
