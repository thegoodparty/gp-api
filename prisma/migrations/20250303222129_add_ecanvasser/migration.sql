-- CreateTable
CREATE TABLE "ecanvasser" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "api_key" TEXT NOT NULL,
    "campaign_id" INTEGER NOT NULL,
    "appointments" JSONB NOT NULL DEFAULT '[]',
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "custom_fields" JSONB NOT NULL DEFAULT '[]',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "efforts" JSONB NOT NULL DEFAULT '[]',
    "follow_ups" JSONB NOT NULL DEFAULT '[]',
    "houses" JSONB NOT NULL DEFAULT '[]',
    "interactions" JSONB NOT NULL DEFAULT '[]',
    "surveys" JSONB NOT NULL DEFAULT '[]',
    "questions" JSONB NOT NULL DEFAULT '[]',
    "teams" JSONB NOT NULL DEFAULT '[]',
    "users" JSONB NOT NULL DEFAULT '[]',
    "last_sync" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "ecanvasser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ecanvasser_campaign_id_key" ON "ecanvasser"("campaign_id");

-- CreateIndex
CREATE INDEX "ecanvasser_campaign_id_idx" ON "ecanvasser"("campaign_id");

-- AddForeignKey
ALTER TABLE "ecanvasser" ADD CONSTRAINT "ecanvasser_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
