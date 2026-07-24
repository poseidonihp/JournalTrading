-- CreateTable: trade_types
CREATE TABLE "trade_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trade_types_user_id_idx" ON "trade_types"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trade_types_user_id_name_key" ON "trade_types"("user_id", "name");

-- AddForeignKey
ALTER TABLE "trade_types"
    ADD CONSTRAINT "trade_types_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Sembrar tipos por defecto para cada usuario existente.
INSERT INTO "trade_types" ("id", "user_id", "name", "color", "code")
SELECT gen_random_uuid(), u."id", t."name", t."color", t."code"
FROM "users" u
CROSS JOIN (
    VALUES
        ('Continuación',        '#6366f1', 'CONTINUATION'),
        ('Rompimiento',         '#22c55e', 'BREAKOUT'),
        ('Cambio de Tendencia', '#a855f7', 'TREND_REVERSAL'),
        ('Lateral',             '#0ea5e9', 'RANGE'),
        ('Apertura',            '#f59e0b', 'OPENING')
) AS t("name", "color", "code")
ON CONFLICT ("user_id", "name") DO NOTHING;

-- AlterTable: añadir columna nullable primero, mapear datos y luego enforce NOT NULL.
ALTER TABLE "trades" ADD COLUMN "trade_type_id" UUID;

-- Migrar datos existentes: relacionar trade.trade_type (enum) → trade_types.code del mismo usuario.
UPDATE "trades" tr
SET "trade_type_id" = tt."id"
FROM "trade_types" tt
WHERE tt."user_id" = tr."user_id"
  AND tt."code" = tr."trade_type"::text;

-- Enforce NOT NULL.
ALTER TABLE "trades" ALTER COLUMN "trade_type_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "trades"
    ADD CONSTRAINT "trades_trade_type_id_fkey"
    FOREIGN KEY ("trade_type_id") REFERENCES "trade_types"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop columna y enum viejo.
ALTER TABLE "trades" DROP COLUMN "trade_type";
DROP TYPE "TradeType";
