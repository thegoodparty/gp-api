-- CreateEnum
CREATE TYPE "MeetingResourceLocationType" AS ENUM ('AGENDA', 'SCHEDULE');

-- CreateTable
CREATE TABLE "meeting_resource_location" (
    "id" TEXT NOT NULL,
    "elected_office_id" TEXT NOT NULL,
    "type" "MeetingResourceLocationType" NOT NULL,
    "description" TEXT NOT NULL,
    "experiment_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_resource_location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meeting_resource_location_elected_office_id_type_key" ON "meeting_resource_location"("elected_office_id", "type");

-- AddForeignKey
ALTER TABLE "meeting_resource_location" ADD CONSTRAINT "meeting_resource_location_elected_office_id_fkey" FOREIGN KEY ("elected_office_id") REFERENCES "elected_office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_resource_location" ADD CONSTRAINT "meeting_resource_location_experiment_run_id_fkey" FOREIGN KEY ("experiment_run_id") REFERENCES "experiment_run"("run_id") ON DELETE SET NULL ON UPDATE CASCADE;
