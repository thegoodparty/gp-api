/*
  Warnings:

  - You are about to drop the column `yearOfBirth` on the `ecanvasser_contacts` table. All the data in the column will be lost.
  - You are about to drop the column `action_id` on the `ecanvasser_houses` table. All the data in the column will be lost.
  - You are about to drop the column `building_id` on the `ecanvasser_houses` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `ecanvasser_houses` table. All the data in the column will be lost.
  - You are about to drop the column `created_by` on the `ecanvasser_houses` table. All the data in the column will be lost.
  - You are about to drop the column `last_interaction_id` on the `ecanvasser_houses` table. All the data in the column will be lost.
  - You are about to drop the column `location_type` on the `ecanvasser_houses` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `ecanvasser_houses` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `ecanvasser_houses` table. All the data in the column will be lost.
  - You are about to drop the column `number` on the `ecanvasser_houses` table. All the data in the column will be lost.
  - You are about to drop the column `precinct` on the `ecanvasser_houses` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `ecanvasser_houses` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `ecanvasser_houses` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `ecanvasser_houses` table. All the data in the column will be lost.
  - You are about to drop the column `unit` on the `ecanvasser_houses` table. All the data in the column will be lost.
  - You are about to drop the column `zip_code` on the `ecanvasser_houses` table. All the data in the column will be lost.
  - You are about to drop the column `action_id` on the `ecanvasser_interactions` table. All the data in the column will be lost.
  - You are about to drop the column `contactId` on the `ecanvasser_interactions` table. All the data in the column will be lost.
  - You are about to drop the column `effort_id` on the `ecanvasser_interactions` table. All the data in the column will be lost.
  - You are about to drop the column `houseId` on the `ecanvasser_interactions` table. All the data in the column will be lost.
  - You are about to drop the column `rating` on the `ecanvasser_interactions` table. All the data in the column will be lost.
  - You are about to drop the column `status_color` on the `ecanvasser_interactions` table. All the data in the column will be lost.
  - You are about to drop the column `status_description` on the `ecanvasser_interactions` table. All the data in the column will be lost.
  - You are about to drop the column `status_id` on the `ecanvasser_interactions` table. All the data in the column will be lost.
  - You are about to drop the column `status_name` on the `ecanvasser_interactions` table. All the data in the column will be lost.
  - You are about to drop the column `color` on the `ecanvasser_teams` table. All the data in the column will be lost.
  - You are about to drop the column `billing` on the `ecanvasser_users` table. All the data in the column will be lost.
  - You are about to drop the column `country_code` on the `ecanvasser_users` table. All the data in the column will be lost.
  - You are about to drop the column `joined` on the `ecanvasser_users` table. All the data in the column will be lost.
  - You are about to drop the column `permission` on the `ecanvasser_users` table. All the data in the column will be lost.
  - You are about to drop the column `phone_number` on the `ecanvasser_users` table. All the data in the column will be lost.
  - Made the column `status` on table `ecanvasser_appointments` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `contact_id` to the `ecanvasser_interactions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `ecanvasser_teams` table without a default value. This is not possible if the table is not empty.
  - Added the required column `created_by` to the `ecanvasser_users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `ecanvasser_users` table without a default value. This is not possible if the table is not empty.
  - Made the column `email` on table `ecanvasser_users` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ecanvasser_appointments" ALTER COLUMN "description" DROP NOT NULL,
ALTER COLUMN "status" SET NOT NULL;

-- AlterTable
ALTER TABLE "ecanvasser_contacts" DROP COLUMN "yearOfBirth",
ADD COLUMN     "ecanvasserHouseId" INTEGER,
ADD COLUMN     "year_of_birth" TEXT;

-- AlterTable
ALTER TABLE "ecanvasser_documents" ALTER COLUMN "file_size" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ecanvasser_houses" DROP COLUMN "action_id",
DROP COLUMN "building_id",
DROP COLUMN "city",
DROP COLUMN "created_by",
DROP COLUMN "last_interaction_id",
DROP COLUMN "location_type",
DROP COLUMN "name",
DROP COLUMN "notes",
DROP COLUMN "number",
DROP COLUMN "precinct",
DROP COLUMN "source",
DROP COLUMN "state",
DROP COLUMN "type",
DROP COLUMN "unit",
DROP COLUMN "zip_code",
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "unique_identifier" TEXT;

-- AlterTable
ALTER TABLE "ecanvasser_interactions" DROP COLUMN "action_id",
DROP COLUMN "contactId",
DROP COLUMN "effort_id",
DROP COLUMN "houseId",
DROP COLUMN "rating",
DROP COLUMN "status_color",
DROP COLUMN "status_description",
DROP COLUMN "status_id",
DROP COLUMN "status_name",
ADD COLUMN     "contact_id" INTEGER NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'Active';

-- AlterTable
ALTER TABLE "ecanvasser_surveys" ALTER COLUMN "description" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ecanvasser_teams" DROP COLUMN "color",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'Active',
ADD COLUMN     "type" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ecanvasser_users" DROP COLUMN "billing",
DROP COLUMN "country_code",
DROP COLUMN "joined",
DROP COLUMN "permission",
DROP COLUMN "phone_number",
ADD COLUMN     "created_by" INTEGER NOT NULL,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'Active',
ADD COLUMN     "type" TEXT NOT NULL,
ALTER COLUMN "email" SET NOT NULL;

-- CreateTable
CREATE TABLE "ecanvasser_lists" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "created_by" INTEGER NOT NULL,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_notes" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contact_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_people" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "created_by" INTEGER NOT NULL,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecanvasser_scripts" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "created_by" INTEGER NOT NULL,
    "ecanvasser_id" INTEGER NOT NULL,

    CONSTRAINT "ecanvasser_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ecanvasser_lists_ecanvasser_id_idx" ON "ecanvasser_lists"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_notes_ecanvasser_id_idx" ON "ecanvasser_notes"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_people_ecanvasser_id_idx" ON "ecanvasser_people"("ecanvasser_id");

-- CreateIndex
CREATE INDEX "ecanvasser_scripts_ecanvasser_id_idx" ON "ecanvasser_scripts"("ecanvasser_id");

-- AddForeignKey
ALTER TABLE "ecanvasser_contacts" ADD CONSTRAINT "ecanvasser_contacts_ecanvasserHouseId_fkey" FOREIGN KEY ("ecanvasserHouseId") REFERENCES "ecanvasser_houses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_lists" ADD CONSTRAINT "ecanvasser_lists_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_notes" ADD CONSTRAINT "ecanvasser_notes_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_people" ADD CONSTRAINT "ecanvasser_people_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecanvasser_scripts" ADD CONSTRAINT "ecanvasser_scripts_ecanvasser_id_fkey" FOREIGN KEY ("ecanvasser_id") REFERENCES "ecanvasser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
