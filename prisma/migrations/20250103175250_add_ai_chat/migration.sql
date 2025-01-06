-- CreateTable
CREATE TABLE "ai_chat" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "thread_id" TEXT,
    "assistant" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "campaign_id" INTEGER,
    "data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ai_chat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_chat_thread_id_key" ON "ai_chat"("thread_id");

-- CreateIndex
CREATE INDEX "ai_chat_thread_id_idx" ON "ai_chat"("thread_id");

-- AddForeignKey
ALTER TABLE "ai_chat" ADD CONSTRAINT "ai_chat_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat" ADD CONSTRAINT "ai_chat_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
