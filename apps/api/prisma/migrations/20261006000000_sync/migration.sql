-- CreateEnum
CREATE TYPE "BookerOrderStatus" AS ENUM ('RECEIVED', 'INVOICED');

-- CreateTable
CREATE TABLE "BookerOrder" (
    "id" SERIAL NOT NULL,
    "clientRef" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "viaCustomerId" TEXT,
    "bookerId" TEXT NOT NULL,
    "status" "BookerOrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "invoiceId" INTEGER,
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookerOrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "BookerOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookerOrder_clientRef_key" ON "BookerOrder"("clientRef");

-- CreateIndex
CREATE UNIQUE INDEX "BookerOrder_invoiceId_key" ON "BookerOrder"("invoiceId");

-- CreateIndex
CREATE INDEX "BookerOrder_status_createdAt_idx" ON "BookerOrder"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "BookerOrder" ADD CONSTRAINT "BookerOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookerOrder" ADD CONSTRAINT "BookerOrder_viaCustomerId_fkey" FOREIGN KEY ("viaCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookerOrderItem" ADD CONSTRAINT "BookerOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "BookerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

