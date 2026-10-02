-- CreateEnum
CREATE TYPE "Account" AS ENUM ('CASH', 'BANK', 'AR', 'AP', 'SALES', 'SALES_RETURN', 'TAX_CHARGED', 'TAX_ABSORBED', 'INVENTORY', 'EXPENSE', 'OPENING_EQUITY');

-- CreateEnum
CREATE TYPE "VoucherKind" AS ENUM ('CASH_RECEIPT', 'BANK_RECEIPT', 'CASH_PAYMENT', 'BANK_PAYMENT', 'EXPENSE', 'JOURNAL');

-- CreateTable
CREATE TABLE "Voucher" (
    "id" SERIAL NOT NULL,
    "kind" "VoucherKind" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memo" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" SERIAL NOT NULL,
    "voucherId" INTEGER NOT NULL,
    "account" "Account" NOT NULL,
    "debitPaisa" INTEGER NOT NULL DEFAULT 0,
    "creditPaisa" INTEGER NOT NULL DEFAULT 0,
    "customerId" TEXT,
    "supplierId" TEXT,
    "memo" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Voucher_date_idx" ON "Voucher"("date");

-- CreateIndex
CREATE INDEX "Voucher_kind_idx" ON "Voucher"("kind");

-- CreateIndex
CREATE INDEX "JournalLine_account_customerId_idx" ON "JournalLine"("account", "customerId");

-- CreateIndex
CREATE INDEX "JournalLine_account_supplierId_idx" ON "JournalLine"("account", "supplierId");

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Golden Rule 3 applies to money too: vouchers and journal lines are append-only.
-- Corrections are NEW documents (credit/debit notes, M7) - never edits.
CREATE OR REPLACE FUNCTION prevent_finance_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'finance documents are append-only (corrections are new vouchers)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER voucher_append_only
  BEFORE UPDATE OR DELETE ON "Voucher"
  FOR EACH ROW EXECUTE FUNCTION prevent_finance_mutation();

CREATE TRIGGER journal_line_append_only
  BEFORE UPDATE OR DELETE ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION prevent_finance_mutation();
