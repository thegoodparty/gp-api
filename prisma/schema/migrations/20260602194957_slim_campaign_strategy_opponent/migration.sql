/*
  Warnings:

  - You are about to drop the column `political_summary` on the `campaign_strategy_opponent` table. All the data in the column will be lost.
  - You are about to drop the `campaign_strategy_opponent_key_fact` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `campaign_strategy_opponent_website` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "campaign_strategy_opponent_key_fact" DROP CONSTRAINT "campaign_strategy_opponent_key_fact_opponent_id_fkey";

-- DropForeignKey
ALTER TABLE "campaign_strategy_opponent_website" DROP CONSTRAINT "campaign_strategy_opponent_website_opponent_id_fkey";

-- AlterTable
ALTER TABLE "campaign_strategy" ADD COLUMN     "opportunities_run_id" TEXT,
ADD COLUMN     "opposition_run_id" TEXT;

-- AlterTable
ALTER TABLE "campaign_strategy_opponent" DROP COLUMN "political_summary";

-- DropTable
DROP TABLE "campaign_strategy_opponent_key_fact";

-- DropTable
DROP TABLE "campaign_strategy_opponent_website";
