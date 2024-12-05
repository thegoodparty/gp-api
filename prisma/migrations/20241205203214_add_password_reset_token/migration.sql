-- AlterTable
ALTER TABLE "user" ADD COLUMN     "password_reset_token" TEXT,
ADD COLUMN     "password_reset_token_expires_at" BIGINT;
