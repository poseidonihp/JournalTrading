-- CreateEnum
CREATE TYPE "InstrumentCategory" AS ENUM ('FUTURE', 'CFD');

-- CreateEnum
CREATE TYPE "TradeDirection" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "TradeType" AS ENUM ('CONTINUATION', 'BREAKOUT', 'TREND_REVERSAL', 'RANGE', 'OPENING');

-- CreateEnum
CREATE TYPE "ExitReason" AS ENUM ('TARGET', 'TRAILING_STOP', 'INITIAL_STOP', 'MANUAL');

-- CreateEnum
CREATE TYPE "Emotion" AS ENUM ('CONFIDENT', 'MISTAKE', 'PARAM_ERROR', 'EMOTIONAL_ERROR');

-- CreateEnum
CREATE TYPE "TradeSource" AS ENUM ('MANUAL', 'CSV', 'NINJATRADER');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "locale" TEXT NOT NULL DEFAULT 'es',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "broker" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "initial_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instruments" (
    "id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "InstrumentCategory" NOT NULL,
    "point_value" DECIMAL(18,8) NOT NULL,
    "default_commission_per_contract" DECIMAL(18,4) NOT NULL,
    "tick_size" DECIMAL(18,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "entered_at" TIMESTAMPTZ(3) NOT NULL,
    "exited_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "contracts" INTEGER NOT NULL,
    "direction" "TradeDirection" NOT NULL,
    "trade_type" "TradeType" NOT NULL,
    "entry_reason" TEXT,
    "exit_reason" "ExitReason" NOT NULL,
    "emotion" "Emotion" NOT NULL,
    "points_total" DECIMAL(18,4) NOT NULL,
    "point_value_snapshot" DECIMAL(18,8) NOT NULL,
    "gross" DECIMAL(18,2) NOT NULL,
    "commission" DECIMAL(18,2) NOT NULL,
    "net" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "source" "TradeSource" NOT NULL DEFAULT 'MANUAL',
    "external_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_media" (
    "id" UUID NOT NULL,
    "trade_id" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "path" TEXT NOT NULL,
    "thumbnail_path" TEXT,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_tags" (
    "trade_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "trade_tags_pkey" PRIMARY KEY ("trade_id","tag_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_name_key" ON "accounts"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "instruments_symbol_key" ON "instruments"("symbol");

-- CreateIndex
CREATE INDEX "trades_user_id_account_id_idx" ON "trades"("user_id", "account_id");

-- CreateIndex
CREATE INDEX "trades_entered_at_idx" ON "trades"("entered_at");

-- CreateIndex
CREATE UNIQUE INDEX "trades_source_external_id_key" ON "trades"("source", "external_id");

-- CreateIndex
CREATE INDEX "trade_media_trade_id_idx" ON "trade_media"("trade_id");

-- CreateIndex
CREATE INDEX "tags_user_id_idx" ON "tags"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_user_id_name_key" ON "tags"("user_id", "name");

-- CreateIndex
CREATE INDEX "trade_tags_tag_id_idx" ON "trade_tags"("tag_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_media" ADD CONSTRAINT "trade_media_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_tags" ADD CONSTRAINT "trade_tags_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_tags" ADD CONSTRAINT "trade_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
