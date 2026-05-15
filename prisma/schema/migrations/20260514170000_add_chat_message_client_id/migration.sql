-- AlterTable
ALTER TABLE "chat_message" ADD COLUMN "client_message_id" TEXT;

-- CreateIndex
CREATE INDEX "chat_message_conversation_id_client_message_id_idx" ON "chat_message"("conversation_id", "client_message_id");

-- Partial unique: enforces dedup on (conversation_id, client_message_id) only when
-- the client supplied an id. Postgres treats NULL as distinct in unique indexes,
-- which would let server-internal callers (no client id) collide on the column.
-- The WHERE clause filters those out so omitting client_message_id stays free of
-- the constraint.
CREATE UNIQUE INDEX "chat_message_conversation_id_client_message_id_active_key"
  ON "chat_message" ("conversation_id", "client_message_id")
  WHERE "client_message_id" IS NOT NULL;
