-- CreateEnum
CREATE TYPE "Disposition" AS ENUM ('SALEABLE', 'DAMAGED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ClaimKind" AS ENUM ('TAX_ABSORBED', 'EXPIRY');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'SENT', 'PAID');

-- AlterEnum
ALTER TYPE "Account" ADD VALUE 'EXPIRY_CLAIMS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockDocKind" ADD VALUE 'RETURN';
ALTER TYPE "StockDocKind" ADD VALUE 'RETURN_OUT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMoveKind" ADD VALUE 'RETURN';
ALTER TYPE "StockMoveKind" ADD VALUE 'RETURN_OUT';

-- CreateTable
CREATE TABLE "SalesReturn" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReturnItem" (
    "id" SERIAL NOT NULL,
    "returnId" INTEGER NOT NULL,
    "invoiceItemId" INTEGER,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitNetPaisa" INTEGER NOT NULL,
    "taxChargedPropPaisa" INTEGER NOT NULL,
    "taxAbsorbedPropPaisa" INTEGER NOT NULL,
    "disposition" "Disposition" NOT NULL,

    CONSTRAINT "SalesReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyClaim" (
    "id" SERIAL NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "ClaimKind" NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
    "memo" TEXT,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidAmountPaisa" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesReturn_invoiceId_idx" ON "SalesReturn"("invoiceId");

-- CreateIndex
CREATE INDEX "CompanyClaim_companyId_status_idx" ON "CompanyClaim"("companyId", "status");

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "SalesReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "SalesInvoiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyClaim" ADD CONSTRAINT "CompanyClaim_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Return items frozen forever (money reversal as posted).
CREATE OR REPLACE FUNCTION prevent_return_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'sales return items are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sales_return_item_append_only
  BEFORE UPDATE OR DELETE ON "SalesReturnItem"
  FOR EACH ROW EXECUTE FUNCTION prevent_return_mutation();
