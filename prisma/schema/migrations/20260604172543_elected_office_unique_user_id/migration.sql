-- DropIndex
DROP INDEX "elected_office_user_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "elected_office_user_id_key" ON "elected_office"("user_id");
