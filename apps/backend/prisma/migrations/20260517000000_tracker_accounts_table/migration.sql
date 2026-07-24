-- CreateEnum
CREATE TYPE "TrackerAccountType" AS ENUM ('EVALUATION', 'LIVE');

-- CreateEnum
CREATE TYPE "TrackerAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "tracker_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TrackerAccountType" NOT NULL,
    "status" "TrackerAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "company" TEXT NOT NULL,
    "total_expenses" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_profits" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tracker_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tracker_accounts_user_id_idx" ON "tracker_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracker_accounts_user_id_name_key" ON "tracker_accounts"("user_id", "name");

-- AddForeignKey
ALTER TABLE "tracker_accounts" ADD CONSTRAINT "tracker_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
