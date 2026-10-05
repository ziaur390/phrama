-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('FRESH', 'COUNTER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('POSTED', 'VOID');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockDocKind" ADD VALUE 'SALE';
ALTER TYPE "StockDocKind" ADD VALUE 'SALE_VOID';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMoveKind" ADD VALUE 'SALE';
ALTER TYPE "StockMoveKind" ADD VALUE 'SALE_VOID';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VoucherKind" ADD VALUE 'CREDIT_NOTE';
ALTER TYPE "VoucherKind" ADD VALUE 'DEBIT_NOTE';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "standingDiscountPct" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockDocument" ADD COLUMN     "saleInvoiceId" INTEGER;

-- CreateTable
CREATE TABLE "SalesInvoice" (
    "id" SERIAL NOT NULL,
    "customerId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "channel" "SalesChannel" NOT NULL DEFAULT 'FRESH',
    "userId" TEXT NOT NULL,
    "bookerId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memo" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'POSTED',
    "voidReason" TEXT,
    "voidedBy" TEXT,
    "voidedAt" TIMESTAMP(3),
    "stockDocId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoiceItem" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPricePaisa" INTEGER NOT NULL,
    "discountPct" INTEGER NOT NULL DEFAULT 0,
    "isBonus" BOOLEAN NOT NULL DEFAULT false,
    "taxChargedPaisa" INTEGER NOT NULL DEFAULT 0,
    "taxAbsorbedPaisa" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRule" (
    "id" SERIAL NOT NULL,
    "companyId" TEXT,
    "productId" TEXT,
    "minQty" INTEGER NOT NULL,
    "discountPct" INTEGER NOT NULL,

    CONSTRAINT "DiscountRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusRule" (
    "id" SERIAL NOT NULL,
    "productId" TEXT NOT NULL,
    "buyQty" INTEGER NOT NULL,
    "freeQty" INTEGER NOT NULL,

    CONSTRAINT "BonusRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_stockDocId_key" ON "SalesInvoice"("stockDocId");

-- CreateIndex
CREATE INDEX "SalesInvoice_date_idx" ON "SalesInvoice"("date");

-- CreateIndex
CREATE INDEX "SalesInvoice_customerId_idx" ON "SalesInvoice"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "BonusRule_productId_key" ON "BonusRule"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockDocument_saleInvoiceId_key" ON "StockDocument"("saleInvoiceId");

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_stockDocId_fkey" FOREIGN KEY ("stockDocId") REFERENCES "StockDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceItem" ADD CONSTRAINT "SalesInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceItem" ADD CONSTRAINT "SalesInvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceItem" ADD CONSTRAINT "SalesInvoiceItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusRule" ADD CONSTRAINT "BonusRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Sales invoice items are frozen forever (pricing + tax as posted). Invoice header
-- keeps a mutable status flag only (VOID), items never edited.
CREATE OR REPLACE FUNCTION prevent_sales_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'sales invoice items are append-only (corrections are void / credit notes)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sales_invoice_item_append_only
  BEFORE UPDATE OR DELETE ON "SalesInvoiceItem"
  FOR EACH ROW EXECUTE FUNCTION prevent_sales_mutation();
