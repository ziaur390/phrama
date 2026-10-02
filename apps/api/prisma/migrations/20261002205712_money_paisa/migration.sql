/*
  Warnings:

  - The primary key for the `AuditLog` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `AuditLog` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.
  - You are about to drop the column `costPriceKs` on the `Batch` table. All the data in the column will be lost.
  - You are about to drop the column `creditLimitKs` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `openingBalanceKs` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `salePriceKs` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `openingBalanceKs` on the `Supplier` table. All the data in the column will be lost.
  - Added the required column `costPricePaisa` to the `Batch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `salePricePaisa` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- AuditLog is empty in dev; drop+recreate with integer PK (SERIAL)
DROP TABLE "AuditLog";
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Batch" DROP COLUMN "costPriceKs",
ADD COLUMN     "costPricePaisa" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "creditLimitKs",
DROP COLUMN "openingBalanceKs",
ADD COLUMN     "creditLimitPaisa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openingBalancePaisa" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "salePriceKs",
ADD COLUMN     "salePricePaisa" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Supplier" DROP COLUMN "openingBalanceKs",
ADD COLUMN     "openingBalancePaisa" INTEGER NOT NULL DEFAULT 0;
