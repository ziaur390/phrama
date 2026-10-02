-- CreateEnum
CREATE TYPE "StockDocKind" AS ENUM ('OPENING', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StockMoveKind" AS ENUM ('OPENING', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "StockDocument" (
    "id" TEXT NOT NULL,
    "kind" "StockDocKind" NOT NULL,
    "reason" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "kind" "StockMoveKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockDocument_createdAt_idx" ON "StockDocument"("createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_productId_batchId_warehouseId_idx" ON "StockMovement"("productId", "batchId", "warehouseId");

-- CreateIndex
CREATE INDEX "StockMovement_docId_idx" ON "StockMovement"("docId");

-- AddForeignKey
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_docId_fkey" FOREIGN KEY ("docId") REFERENCES "StockDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Golden Rule 3: stock_movements is append-only. Update/delete = exception, forever.
CREATE OR REPLACE FUNCTION prevent_stock_movement_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only (documented corrections are new movements)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_movements_append_only
  BEFORE UPDATE OR DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION prevent_stock_movement_mutation();
