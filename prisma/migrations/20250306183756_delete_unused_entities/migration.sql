/*
  Warnings:

  - You are about to drop the `ecanvasser_appointments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ecanvasser_custom_fields` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ecanvasser_documents` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ecanvasser_efforts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ecanvasser_follow_ups` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ecanvasser_notes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ecanvasser_people` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ecanvasser_questions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ecanvasser_scripts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ecanvasser_surveys` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ecanvasser_teams` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ecanvasser_users` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ecanvasser_appointments" DROP CONSTRAINT "ecanvasser_appointments_ecanvasser_id_fkey";

-- DropForeignKey
ALTER TABLE "ecanvasser_custom_fields" DROP CONSTRAINT "ecanvasser_custom_fields_ecanvasser_id_fkey";

-- DropForeignKey
ALTER TABLE "ecanvasser_documents" DROP CONSTRAINT "ecanvasser_documents_ecanvasser_id_fkey";

-- DropForeignKey
ALTER TABLE "ecanvasser_efforts" DROP CONSTRAINT "ecanvasser_efforts_ecanvasser_id_fkey";

-- DropForeignKey
ALTER TABLE "ecanvasser_follow_ups" DROP CONSTRAINT "ecanvasser_follow_ups_ecanvasser_id_fkey";

-- DropForeignKey
ALTER TABLE "ecanvasser_notes" DROP CONSTRAINT "ecanvasser_notes_ecanvasser_id_fkey";

-- DropForeignKey
ALTER TABLE "ecanvasser_people" DROP CONSTRAINT "ecanvasser_people_ecanvasser_id_fkey";

-- DropForeignKey
ALTER TABLE "ecanvasser_questions" DROP CONSTRAINT "ecanvasser_questions_ecanvasser_id_fkey";

-- DropForeignKey
ALTER TABLE "ecanvasser_scripts" DROP CONSTRAINT "ecanvasser_scripts_ecanvasser_id_fkey";

-- DropForeignKey
ALTER TABLE "ecanvasser_surveys" DROP CONSTRAINT "ecanvasser_surveys_ecanvasser_id_fkey";

-- DropForeignKey
ALTER TABLE "ecanvasser_teams" DROP CONSTRAINT "ecanvasser_teams_ecanvasser_id_fkey";

-- DropForeignKey
ALTER TABLE "ecanvasser_users" DROP CONSTRAINT "ecanvasser_users_ecanvasser_id_fkey";

-- DropTable
DROP TABLE "ecanvasser_appointments";

-- DropTable
DROP TABLE "ecanvasser_custom_fields";

-- DropTable
DROP TABLE "ecanvasser_documents";

-- DropTable
DROP TABLE "ecanvasser_efforts";

-- DropTable
DROP TABLE "ecanvasser_follow_ups";

-- DropTable
DROP TABLE "ecanvasser_notes";

-- DropTable
DROP TABLE "ecanvasser_people";

-- DropTable
DROP TABLE "ecanvasser_questions";

-- DropTable
DROP TABLE "ecanvasser_scripts";

-- DropTable
DROP TABLE "ecanvasser_surveys";

-- DropTable
DROP TABLE "ecanvasser_teams";

-- DropTable
DROP TABLE "ecanvasser_users";
