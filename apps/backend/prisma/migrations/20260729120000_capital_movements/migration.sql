-- CreateEnum
CREATE TYPE "CapitalMovementType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "initial_balance_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "capital_movements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "type" "CapitalMovementType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capital_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "capital_movements_account_id_occurred_at_idx" ON "capital_movements"("account_id", "occurred_at");

-- CreateIndex
CREATE INDEX "capital_movements_user_id_idx" ON "capital_movements"("user_id");

-- AddForeignKey
ALTER TABLE "capital_movements" ADD CONSTRAINT "capital_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_movements" ADD CONSTRAINT "capital_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
