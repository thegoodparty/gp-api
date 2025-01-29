-- AlterTable
ALTER TABLE "user" ADD COLUMN     "has_password" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "password" DROP NOT NULL;
