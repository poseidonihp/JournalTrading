-- CreateEnum
CREATE TYPE "DataFeeFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "data_fee_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "data_fee_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "data_fee_frequency" "DataFeeFrequency",
ADD COLUMN     "data_fee_last_charged_at" TIMESTAMPTZ(3),
ADD COLUMN     "data_fee_next_charge_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "data_fee_charges" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "frequency" "DataFeeFrequency" NOT NULL,
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "charged_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_fee_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_fee_charges_account_id_charged_at_idx" ON "data_fee_charges"("account_id", "charged_at");

-- AddForeignKey
ALTER TABLE "data_fee_charges" ADD CONSTRAINT "data_fee_charges_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
