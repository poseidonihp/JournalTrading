/*
  Warnings:

  - You are about to drop the `tags` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `trade_tags` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "tags" DROP CONSTRAINT "tags_user_id_fkey";

-- DropForeignKey
ALTER TABLE "trade_tags" DROP CONSTRAINT "trade_tags_tag_id_fkey";

-- DropForeignKey
ALTER TABLE "trade_tags" DROP CONSTRAINT "trade_tags_trade_id_fkey";

-- DropTable
DROP TABLE "tags";

-- DropTable
DROP TABLE "trade_tags";
