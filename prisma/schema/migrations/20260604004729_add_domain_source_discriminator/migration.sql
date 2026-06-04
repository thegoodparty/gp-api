-- CreateEnum
CREATE TYPE "DomainSource" AS ENUM ('manual', 'agentic');

-- AlterTable
ALTER TABLE "domain" ADD COLUMN     "source" "DomainSource" NOT NULL DEFAULT 'manual';
