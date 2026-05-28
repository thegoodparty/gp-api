/*
  Warnings:

  - A unique constraint covering the columns `[agentic_run_id]` on the table `tcr_compliance` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "tcr_compliance" ADD COLUMN     "agentic_run_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tcr_compliance_agentic_run_id_key" ON "tcr_compliance"("agentic_run_id");
