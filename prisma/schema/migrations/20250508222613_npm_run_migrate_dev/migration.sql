-- CreateEnum
CREATE TYPE "TcrComplianceStatus" AS ENUM ('submitted', 'pending', 'approved', 'rejected', 'error');

-- CreateTable
CREATE TABLE "tcr_compliance" (
    "id" SERIAL NOT NULL,
    "campaign_id" INTEGER NOT NULL,
    "ein" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "pin" TEXT,
    "donation_platform" TEXT,
    "status" "TcrComplianceStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tcr_compliance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tcr_compliance_campaign_id_idx" ON "tcr_compliance"("campaign_id");

-- AddForeignKey
ALTER TABLE "tcr_compliance" ADD CONSTRAINT "tcr_compliance_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
