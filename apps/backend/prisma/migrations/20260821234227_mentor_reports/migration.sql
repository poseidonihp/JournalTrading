-- CreateEnum
CREATE TYPE "MentorReportStatus" AS ENUM ('OK', 'NO_ADVICE', 'FAILED');

-- CreateTable
CREATE TABLE "mentor_reports" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID,
    "account_set_key" TEXT NOT NULL,
    "account_label" TEXT NOT NULL,
    "period_label" TEXT NOT NULL,
    "period_from" TIMESTAMPTZ(3) NOT NULL,
    "period_to" TIMESTAMPTZ(3) NOT NULL,
    "digest_version" INTEGER NOT NULL,
    "prompt_version" INTEGER NOT NULL,
    "digest_hash" TEXT NOT NULL,
    "digest" JSONB NOT NULL,
    "advice" JSONB,
    "status" "MentorReportStatus" NOT NULL DEFAULT 'OK',
    "model" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "estimated_cost_usd" DECIMAL(12,6),
    "trades" INTEGER NOT NULL DEFAULT 0,
    "net_before_data_fees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentor_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mentor_reports_user_id_created_at_idx" ON "mentor_reports"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "mentor_reports_user_id_account_set_key_period_label_digest__key" ON "mentor_reports"("user_id", "account_set_key", "period_label", "digest_version", "prompt_version", "digest_hash");

-- AddForeignKey
ALTER TABLE "mentor_reports" ADD CONSTRAINT "mentor_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_reports" ADD CONSTRAINT "mentor_reports_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
