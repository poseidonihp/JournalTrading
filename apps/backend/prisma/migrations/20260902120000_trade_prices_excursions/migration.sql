-- AlterTable
ALTER TABLE "trades" ADD COLUMN     "entry_price" DECIMAL(18,4),
ADD COLUMN     "exit_price" DECIMAL(18,4),
ADD COLUMN     "mae" DECIMAL(18,4),
ADD COLUMN     "mfe" DECIMAL(18,4),
ADD COLUMN     "planned_stop" DECIMAL(18,4),
ADD COLUMN     "planned_target" DECIMAL(18,4);
