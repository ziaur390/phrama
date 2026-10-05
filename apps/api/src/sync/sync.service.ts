import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { SalesService } from '../sales/sales.service';
import { withRetry } from '../prisma/with-retry';
import { StockLedgerService } from '../inventory/stock-ledger.service';

/**
 * M10 field sync. The booker's phone works offline and uploads blindly —
 * everything here is idempotent by clientRef, orders land in the warehouse queue,
 * recoveries post straight to the customer's ledger.
 */

const pad = (n: number) => String(n).padStart(6, '0');

@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private finance: FinanceService,
    private sales: SalesService,
    private stock: StockLedgerService,
  ) {}

  /** What the phone needs for a day in the field: catalog, shops with balances, areas. */
  async pull() {
    const [products, customers, territories, warehouses] = await Promise.all([
      this.prisma.product.findMany({
        include: { company: { select: { code: true, name: true } } },
        orderBy: { code: 'asc' },
      }),
      this.prisma.customer.findMany({ include: { territory: true }, orderBy: { code: 'asc' } }),
      this.prisma.territory.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.warehouse.findMany(),
    ]);
    const main = warehouses.find((w) => w.kind === 'MAIN');
    const balances = await this.currentBalances();

    const stockRows = main ? await this.stock.currentStock({ warehouseId: main.id }) : [];
    const stockByProduct = new Map<string, number>();
    for (const r of stockRows) stockByProduct.set(r.productId, (stockByProduct.get(r.productId) ?? 0) + r.qty);

    return {
      syncedAt: new Date().toISOString(),
      catalog: products.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        companyCode: p.company.code,
        companyId: p.companyId,
        pack: p.pack,
        salePricePaisa: p.salePricePaisa,
        stockInMain: stockByProduct.get(p.id) ?? 0,
      })),
      customers: customers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        type: c.type,
        filerStatus: c.filerStatus,
        creditLimitPaisa: c.creditLimitPaisa,
        balancePaisa: balances.get(c.id) ?? 0,
        territoryName: c.territory?.name ?? null,
        salesmanId: c.salesmanId,
      })),
      territories,
    };
  }

  private async currentBalances(): Promise<Map<string, number>> {
    const agg = await this.prisma.journalLine.groupBy({
      by: ['customerId'],
      where: { account: 'AR', customerId: { not: null } },
      _sum: { debitPaisa: true, creditPaisa: true },
    });
    return new Map(agg.map((r) => [r.customerId!, (r._sum.debitPaisa ?? 0) - (r._sum.creditPaisa ?? 0)]));
  }

  /** Offline order upload — idempotent by clientRef. */
  async uploadOrder(bookerId: string, dto: { clientRef: string; customerId: string; viaCustomerId?: string; bookedAt?: string; items: { productId: string; qty: number }[] }) {
    if (!dto.items?.length) throw new BadRequestException('Order needs at least one item');
    const existing = await this.prisma.bookerOrder.findUnique({ where: { clientRef: dto.clientRef } });
    if (existing) return { ...existing, number: `BO-${pad(existing.id)}`, duplicate: true };

    if (dto.viaCustomerId && dto.viaCustomerId === dto.customerId)
      throw new BadRequestException('via salesman = customer?');

    const order = await withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({ where: { id: dto.customerId } });
        if (!customer) throw new NotFoundException('Unknown customer');
        if (dto.viaCustomerId) {
          const via = await tx.customer.findUnique({ where: { id: dto.viaCustomerId } });
          if (!via || via.type !== 'SALESMAN') throw new BadRequestException('viaCustomerId must be a SALESMAN customer');
        }
        return tx.bookerOrder.create({
          data: {
            clientRef: dto.clientRef,
            customerId: dto.customerId,
            ...(dto.viaCustomerId ? { viaCustomerId: dto.viaCustomerId } : {}),
            bookerId,
            ...(dto.bookedAt ? { bookedAt: new Date(dto.bookedAt) } : {}),
            items: { create: dto.items.map((i) => ({ productId: i.productId, qty: i.qty })) },
          },
          include: { items: true },
        });
      }),
    );
    return { ...order, number: `BO-${pad(order.id)}`, duplicate: false };
  }

  /** Recovery recorded at the shop — idempotent by clientRef. */
  async uploadRecovery(bookerId: string, dto: { clientRef: string; customerId: string; amountPaisa: number; mode: 'CASH' | 'BANK'; collectedAt?: string }) {
    if (dto.amountPaisa <= 0) throw new BadRequestException('amount must be positive');
    const existing = await this.prisma.journalLine.findFirst({
      where: { voucher: { memo: { startsWith: `Recovery ${dto.clientRef}` } } },
    });
    if (existing) return { duplicate: true, voucherId: existing.voucherId };

    const voucher = await this.finance.postVoucher(bookerId, {
      kind: dto.mode === 'BANK' ? 'BANK_RECEIPT' : 'CASH_RECEIPT',
      customerId: dto.customerId,
      amountPaisa: dto.amountPaisa,
      memo: `Recovery ${dto.clientRef} by booker`,
      ...(dto.collectedAt ? { date: dto.collectedAt } : {}),
    });
    return { duplicate: false, voucherId: voucher.id, number: voucher.number };
  }

  /** Warehouse queue. */
  listOrders(status?: 'RECEIVED' | 'INVOICED') {
    return this.prisma.bookerOrder
      .findMany({
        where: status ? { status } : undefined,
        include: {
          customer: { select: { code: true, name: true } },
          viaCustomer: { select: { code: true, name: true } },
          items: { include: { } },
        },
        orderBy: { id: 'asc' },
      })
      .then((os) => os.map((o) => ({ ...o, number: `BO-${pad(o.id)}` })));
  }

  /** Warehouse turns a queued order into an invoice. Salesman routing: billed to HIM. */
  async invoiceOrder(userId: string, id: number) {
    const order = await this.prisma.bookerOrder.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException();
    if (order.status === 'INVOICED') throw new ConflictException('Order already invoiced');

    const memoRef = `From booker order BO-${pad(id)}`;
    // postInvoice opens its own serializable transaction - so this stays sequential,
    // and a crash between invoice and status update is healed on retry via the memo link.
    let invoice = await this.prisma.salesInvoice.findFirst({ where: { memo: memoRef, status: 'POSTED' } });
    if (!invoice) {
      invoice = (await this.sales.postInvoice(userId, {
        customerId: order.viaCustomerId ?? order.customerId, // via salesman -> billed to him
        warehouseId: (await this.prisma.warehouse.findFirst({ where: { kind: 'MAIN' } }))!.id,
        channel: 'FRESH',
        memo: memoRef,
        items: order.items.map((i) => ({ productId: i.productId, qty: i.qty })),
      })) as any;
    }

    const updated = await this.prisma.bookerOrder.update({ where: { id }, data: { status: 'INVOICED', invoiceId: invoice!.id } });
    return { ...updated, number: `BO-${pad(id)}`, invoice };
  }
}
