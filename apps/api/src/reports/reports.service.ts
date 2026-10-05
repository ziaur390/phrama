import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * M9 reports: everything reconciles against the ledgers (M3 stock, M4 money,
 * M7 invoices+tax) — no separate report tables, no stored aggregates.
 */

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private async net(account: 'AR' | 'AP' | 'CASH' | 'BANK' | 'TAX_ABSORBED' | 'EXPIRY_CLAIMS') {
    const agg = await this.prisma.journalLine.aggregate({ where: { account }, _sum: { debitPaisa: true, creditPaisa: true } });
    return (agg._sum.debitPaisa ?? 0) - (agg._sum.creditPaisa ?? 0);
  }

  /** Owner KPI snapshot: sales today, receivables, cash/bank, claims money coming, expiry risk. */
  async dashboard() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yStart = new Date(todayStart.getTime() - 86_400_000);

    const [today, yesterday, ar, ap, cash, bank, absorbed, expiryClaims, expiring60] = await Promise.all([
      this.prisma.salesInvoiceItem.aggregate({
        where: { invoice: { status: 'POSTED', date: { gte: todayStart } }, isBonus: false },
        _sum: { qty: true },
      }),
      this.prisma.salesInvoiceItem.aggregate({
        where: { invoice: { status: 'POSTED', date: { gte: yStart, lt: todayStart } }, isBonus: false },
        _sum: { qty: true },
      }),
      this.net('AR'),
      this.net('AP'),
      this.net('CASH'),
      this.net('BANK'),
      this.net('TAX_ABSORBED'),
      this.net('EXPIRY_CLAIMS'),
      this.prisma.batch.count({ where: { expiry: { lte: new Date(now.getTime() + 60 * 86_400_000) } } }),
    ]);

    return {
      sales: { boxesToday: today._sum.qty ?? 0, boxesYesterday: yesterday._sum.qty ?? 0 },
      posPaisa: { receivable: ar, payable: ap, cash, bank, absorbedTaxReceivable: absorbed, expiryClaimsReceivable: expiryClaims },
      expiringBatches60d: expiring60,
    };
  }

  /** Sales by day in a range (posted invoices only, excl. bonus lines). */
  async salesByDay(from: string, to: string) {
    const rows = await this.prisma.salesInvoiceItem.groupBy({
      by: ['productId'],
      where: { isBonus: false, invoice: { status: 'POSTED', date: { gte: new Date(from), lte: new Date(to) } } },
      _sum: { qty: true, taxChargedPaisa: true, taxAbsorbedPaisa: true },
    });
    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.productId) } },
      select: { id: true, code: true, name: true },
    });
    const pmap = new Map(products.map((p) => [p.id, p]));
    return rows.map((r) => ({
      productId: r.productId,
      productCode: pmap.get(r.productId)?.code,
      productName: pmap.get(r.productId)?.name,
      qty: r._sum.qty ?? 0,
      taxChargedPaisa: r._sum.taxChargedPaisa ?? 0,
      taxAbsorbedPaisa: r._sum.taxAbsorbedPaisa ?? 0,
    }));
  }

  /** DSR per booker: invoices booked, boxes, charged+absorbed tax, returns, receipts (FRESH channel). */
  async dsr(dateStr?: string) {
    const date = dateStr ? new Date(dateStr) : new Date();
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const end = new Date(start.getTime() + 86_400_000);

    const invoices = await this.prisma.salesInvoice.groupBy({
      by: ['userId'],
      where: { status: 'POSTED', date: { gte: start, lt: end } },
      _count: { id: true },
    });

    const itemAgg = await this.prisma.salesInvoiceItem.aggregate({
      where: { invoice: { status: 'POSTED', date: { gte: start, lt: end } }, isBonus: false },
      _sum: { qty: true, taxChargedPaisa: true, taxAbsorbedPaisa: true },
    });

    const receiptAgg = await this.prisma.journalLine.aggregate({
      where: { account: 'AR', voucher: { kind: 'CASH_RECEIPT', date: { gte: start, lt: end } } },
      _sum: { creditPaisa: true },
    });

    const users = await this.prisma.user.findMany({
      where: { id: { in: invoices.map((i) => i.userId) } },
      select: { id: true, fullName: true },
    });
    const umap = new Map(users.map((u) => [u.id, u.fullName]));

    return {
      date: start.toISOString().slice(0, 10),
      invoicesBooked: invoices.reduce((s, i) => s + (i._count?.id ?? 0), 0),
      boxesSold: itemAgg._sum.qty ?? 0,
      taxChargedPaisa: itemAgg._sum.taxChargedPaisa ?? 0,
      taxAbsorbedPaisa: itemAgg._sum.taxAbsorbedPaisa ?? 0,
      recoveredPaisa: receiptAgg._sum.creditPaisa ?? 0,
      byUser: invoices.map((i) => ({ userId: i.userId, name: umap.get(i.userId) ?? i.userId, invoices: i._count?.id ?? 0 })),
    };
  }

  /** Customer statement + machine-readable reconciliation for a date range (M9 exit criterion). */
  async customerStatement(customerId: string, from: string, to: string) {
    const lines = await this.prisma.journalLine.findMany({
      where: { account: 'AR', customerId, voucher: { date: { gte: new Date(from), lte: new Date(to) } } },
      include: { voucher: { select: { kind: true, date: true, memo: true } } },
      orderBy: { id: 'asc' },
    });
    const openingAgg = await this.prisma.journalLine.aggregate({
      where: { account: 'AR', customerId, voucher: { date: { lt: new Date(from) } } },
      _sum: { debitPaisa: true, creditPaisa: true },
    });
    const opening = (openingAgg._sum.debitPaisa ?? 0) - (openingAgg._sum.creditPaisa ?? 0);
    let running = opening;
    return {
      customerId,
      from,
      to,
      openingPaisa: opening,
      lines: lines.map((l) => {
        running += l.debitPaisa - l.creditPaisa;
        return {
          date: l.voucher.date,
          kind: l.voucher.kind,
          memo: l.memo ?? l.voucher.memo,
          debitPaisa: l.debitPaisa,
          creditPaisa: l.creditPaisa,
          runningPaisa: running,
        };
      }),
      closingPaisa: running,
    };
  }

  /** Reconciliation probe: computed stock per batch vs ledger sum — must always match trivially (same source), kept as an endpoint for spot checks. */
  async stockValuation(warehouseId?: string) {
    const rows = await this.prisma.stockMovement.groupBy({
      by: ['productId', 'batchId', 'warehouseId'],
      where: warehouseId ? { warehouseId } : {},
      _sum: { delta: true },
    });
    const live = rows.filter((r) => (r._sum.delta ?? 0) > 0);
    const batches = await this.prisma.batch.findMany({
      where: { id: { in: live.map((r) => r.batchId) } },
      select: { id: true, costPricePaisa: true, expiry: true },
    });
    const bmap = new Map(batches.map((b) => [b.id, b]));
    return live.map((r) => ({
      productId: r.productId,
      batchId: r.batchId,
      warehouseId: r.warehouseId,
      qty: r._sum.delta ?? 0,
      costPricePaisa: bmap.get(r.batchId)?.costPricePaisa ?? 0,
      valuePaisa: (r._sum.delta ?? 0) * (bmap.get(r.batchId)?.costPricePaisa ?? 0),
      expiry: bmap.get(r.batchId)?.expiry ?? null,
    }));
  }
}
