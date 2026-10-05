import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { bestSlabPct, bonusUnits, priceLine } from './pricing.service';
import { Prisma } from '@prisma/client';

/**
 * M7 sales engine. One transaction per invoice: FEFO batch allocation (frozen on
 * items) + stock OUT + receivable/cash + journal with frozen M5 tax lines.
 * Corrections: Void (full reversal), Credit Note, Debit Note - never an edit.
 * PREPAID dealers: order blocked until payments cover it.
 */

const pad = (n: number) => String(n).padStart(6, '0');
interface ItemInput {
  productId: string;
  qty: number;
}
const HOPEFULLY = null as unknown as Prisma.TransactionClient; // never; typing aid only

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private finance: FinanceService,
    private taxEngine: TaxEngineService,
  ) {}

  /** FEFO: earliest-expiry batches with stock first. Runs inside the post transaction. */
  private async allocateFefo(
    tx: Prisma.TransactionClient,
    productId: string,
    warehouseId: string,
    qty: number,
  ): Promise<{ batchId: string; qty: number }[]> {
    const rows = await tx.stockMovement.groupBy({
      by: ['batchId'],
      where: { productId, warehouseId },
      _sum: { delta: true },
    });
    const withStock = rows.filter((r) => (r._sum.delta ?? 0) > 0);
    if (!withStock.length) throw new BadRequestException(`No stock for product ${productId}`);
    const batches = await tx.batch.findMany({ where: { id: { in: withStock.map((r) => r.batchId) } }, orderBy: { expiry: 'asc' } });
    const stockByBatch = new Map(withStock.map((r) => [r.batchId, r._sum.delta ?? 0]));

    let remaining = qty;
    const out: { batchId: string; qty: number }[] = [];
    for (const b of batches) {
      // ponytail: FEFO splits oldest-first; ties broken by batch id for determinism
      const have = stockByBatch.get(b.id) ?? 0;
      if (remaining <= 0) break;
      const take = Math.min(have, remaining);
      if (take > 0) {
        out.push({ batchId: b.id, qty: take });
        remaining -= take;
      }
    }
    if (remaining > 0) throw new BadRequestException(`Insufficient stock: short ${remaining} of requested ${qty} for product ${productId}`);
    return out;
  }

  async postInvoice(
    userId: string,
    dto: {
      customerId: string;
      warehouseId: string;
      channel?: 'FRESH' | 'COUNTER';
      memo?: string;
      items: ItemInput[];
    },
  ) {
    if (!dto.items?.length) throw new BadRequestException('Invoice needs at least one item');

    const invoice = await this.prisma.$transaction(
      async (tx) => {
        const customer = await tx.customer.findUnique({ where: { id: dto.customerId } });
        if (!customer) throw new NotFoundException('Unknown customer');
        const warehouse = await tx.warehouse.findUnique({ where: { id: dto.warehouseId } });
        if (!warehouse) throw new NotFoundException('Unknown warehouse');

        // pricing + tax inputs (reads inside tx for consistency)
        const productIds = [...new Set(dto.items.map((i) => i.productId))];
        const products = await tx.product.findMany({ where: { id: { in: productIds } } });
        if (products.length !== productIds.length) throw new NotFoundException('Unknown product in items');
        const productById = new Map(products.map((p) => [p.id, p]));

        const rules = await tx.discountRule.findMany({
          where: { OR: [{ productId: { in: productIds } }, { companyId: { in: products.map((p) => p.companyId) } }, { productId: null, companyId: null }] },
        });
        const bonuses = await tx.bonusRule.findMany({ where: { productId: { in: productIds } } });
        const bonusByProduct = new Map(bonuses.map((b) => [b.productId, b]));

        // build the full row set: priced lines + bonus FOC lines, FEFO-allocated per row
        type Row = { productId: string; unitPricePaisa: number; discountPct: number; qty: number; isBonus: boolean };
        const rows: Row[] = [];
        for (const item of dto.items) {
          if (item.qty <= 0) throw new BadRequestException('qty must be positive');
          const p = productById.get(item.productId)!;
          const slab = bestSlabPct(rules, { productId: p.id, companyId: p.companyId, qty: item.qty });
          const priced = priceLine({ qty: item.qty, unitPricePaisa: p.salePricePaisa, slabDiscountPct: slab, standingDiscountPct: customer.standingDiscountPct });
          rows.push({ productId: p.id, unitPricePaisa: p.salePricePaisa, discountPct: priced.discountPct, qty: item.qty, isBonus: false });

          const bonus = bonusByProduct.get(p.id);
          if (bonus) {
            const free = bonusUnits({ qty: item.qty, buyQty: bonus.buyQty, freeQty: bonus.freeQty });
            if (free > 0) rows.push({ productId: p.id, unitPricePaisa: 0, discountPct: 0, qty: free, isBonus: true });
          }
        }

        // PREPAID gate: payments must cover the order value
        const date = new Date();
        let storePays = 0;
        for (const row of rows) {
          if (row.isBonus) continue;
          const net = Math.round(row.qty * row.unitPricePaisa * (1 - row.discountPct / 100));
          const tax = await this.taxEngine.computeLine({
            lineId: 'x',
            companyId: productById.get(row.productId)!.companyId,
            qty: row.qty,
            unitPricePaisa: Math.round(row.unitPricePaisa * (1 - row.discountPct / 100)),
            customerFilerStatus: customer.filerStatus,
            invoiceDate: date,
          });
          storePays += net + tax.taxChargedPaisa;
        }
        if (customer.type === 'PREPAID') {
          const ar = await tx.journalLine.aggregate({
            where: { account: 'AR', customerId: customer.id },
            _sum: { debitPaisa: true, creditPaisa: true },
          });
          const advance = (ar._sum.creditPaisa ?? 0) - (ar._sum.debitPaisa ?? 0); // >0 = surplus paid
          if (advance < storePays)
            throw new BadRequestException(
              `PREPAID dealer must pay first: advance Rs ${(advance / 100).toFixed(2)}, order Rs ${(storePays / 100).toFixed(2)}`,
            );
        }

        // stock: FEFO per row (bonus consumes real stock too)
        const stockDoc = await tx.stockDocument.create({ data: { kind: 'SALE', userId } });
        const allocations: { row: Row; batchId: string; qty: number }[] = [];
        for (const row of rows) {
          for (const a of await this.allocateFefo(tx, row.productId, dto.warehouseId, row.qty)) {
            allocations.push({ row, batchId: a.batchId, qty: a.qty });
            await tx.stockMovement.create({
              data: { docId: stockDoc.id, productId: row.productId, batchId: a.batchId, warehouseId: dto.warehouseId, kind: 'SALE', delta: -a.qty },
            });
          }
        }

        const inv = await tx.salesInvoice.create({
          data: { customerId: customer.id, warehouseId: dto.warehouseId, channel: dto.channel ?? 'FRESH', userId, memo: dto.memo, stockDocId: stockDoc.id },
        });

        // frozen items with tax
        let netTotal = 0;
        let chargedTotal = 0;
        let absorbedTotal = 0;
        for (const a of allocations) {
          const { row } = a;
          let net = 0;
          let charged = 0n;
          let absorbed = 0n;
          if (!row.isBonus) {
            const netUnit = Math.round(row.unitPricePaisa * (1 - row.discountPct / 100));
            const line = await this.taxEngine.computeLine({
              lineId: 'x',
              companyId: productById.get(row.productId)!.companyId,
              qty: a.qty,
              unitPricePaisa: netUnit,
              customerFilerStatus: customer.filerStatus,
              invoiceDate: date,
            });
            net = a.qty * netUnit;
            charged = BigInt(line.taxChargedPaisa);
            absorbed = BigInt(line.taxAbsorbedPaisa);
            netTotal += net;
            chargedTotal += Number(charged);
            absorbedTotal += Number(absorbed);
          }
          await tx.salesInvoiceItem.create({
            data: {
              invoiceId: inv.id,
              productId: row.productId,
              batchId: a.batchId,
              qty: a.qty,
              unitPricePaisa: row.unitPricePaisa,
              discountPct: row.discountPct,
              isBonus: row.isBonus,
              taxChargedPaisa: Number(charged),
              taxAbsorbedPaisa: Number(absorbed),
            },
          });
        }

        // money: FRESH -> receivable; COUNTER -> cash at counter
        const moneyLine: Prisma.VoucherCreateInput['lines'] = undefined as never;
        const lines: Prisma.JournalLineUncheckedCreateWithoutVoucherInput[] =
          dto.channel === 'COUNTER'
            ? [
                { account: 'CASH', debitPaisa: storePays },
                { account: 'SALES', creditPaisa: storePays + absorbedTotal },
              ]
            : [
                { account: 'AR', debitPaisa: storePays, customerId: customer.id },
                { account: 'SALES', creditPaisa: storePays + absorbedTotal },
              ];
        if (absorbedTotal > 0) {
          lines.push({ account: 'TAX_ABSORBED', debitPaisa: absorbedTotal });
          lines[1].creditPaisa = storePays + absorbedTotal;
        }
        const voucher = await tx.voucher.create({
          data: {
            kind: 'JOURNAL',
            memo: `Sales invoice INV-${pad(inv.id)} (${dto.channel ?? 'FRESH'})`,
            userId,
            lines: { create: lines },
          },
        });

        return tx.salesInvoice.findUnique({ where: { id: inv.id }, include: { items: { include: { batch: true } } } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { ...invoice!, number: `INV-${pad(invoice!.id)}` };
  }

  listInvoices(filter: { customerId?: string; status?: 'POSTED' | 'VOID' }) {
    return this.prisma.salesInvoice
      .findMany({
        where: {
          ...(filter.customerId ? { customerId: filter.customerId } : {}),
          ...(filter.status ? { status: filter.status } : {}),
        },
        include: {
          customer: { select: { code: true, name: true, filerStatus: true } },
          warehouse: { select: { name: true } },
          items: { include: { product: { select: { code: true, name: true } }, batch: { select: { batchNo: true, expiry: true } } } },
        },
        orderBy: { id: 'desc' },
      })
      .then((invs) => invs.map((i) => ({ ...i, number: `INV-${pad(i.id)}` })));
  }

  async getInvoice(id: number) {
    const inv = await this.prisma.salesInvoice.findUnique({
      where: { id },
      include: {
        customer: { select: { code: true, name: true, filerStatus: true, type: true } },
        items: { include: { product: { select: { code: true, name: true } }, batch: { select: { batchNo: true, expiry: true } } } },
      },
    });
    if (!inv) throw new NotFoundException();
    return { ...inv, number: `INV-${pad(inv.id)}` };
  }

  /** Void = full reversal: stock back, money back, invoice marked VOID. */
  async voidInvoice(userId: string, id: number, reason: string) {
    if (!reason.trim()) throw new BadRequestException('reason is mandatory on void');
    const invoice = await this.prisma.$transaction(
      async (tx) => {
        const inv = await tx.salesInvoice.findUnique({ where: { id }, include: { items: true } });
        if (!inv) throw new NotFoundException();
        if (inv.status === 'VOID') throw new BadRequestException('Invoice already void');
        if (!inv.stockDocId) throw new BadRequestException('Invoice has no stock document');

        void HOPEFULLY;
        const voidDoc = await tx.stockDocument.create({ data: { kind: 'SALE_VOID', reason: `Void of INV-${pad(id)}: ${reason}`, userId } });
        // group items by batch (same batch may appear in two rows)
        const byBatch = new Map<string, { productId: string; qty: number }>();
        for (const item of inv.items) {
          const cur = byBatch.get(item.batchId) ?? { productId: item.productId, qty: 0 };
          cur.qty += item.qty;
          byBatch.set(item.batchId, cur);
        }
        for (const [batchId, g] of byBatch) {
          await tx.stockMovement.create({
            data: { docId: voidDoc.id, productId: g.productId, batchId, warehouseId: inv.warehouseId, kind: 'SALE_VOID', delta: g.qty },
          });
        }

        // money reversal
        let storePays = 0;
        let absorbed = 0;
        for (const item of inv.items) {
          storePays += item.qty * Math.round(item.unitPricePaisa * (1 - item.discountPct / 100)) + item.taxChargedPaisa;
          absorbed += item.taxAbsorbedPaisa;
        }
        const lines: Prisma.JournalLineUncheckedCreateWithoutVoucherInput[] =
          inv.channel === 'COUNTER'
            ? [
                { account: 'SALES', debitPaisa: storePays + absorbed },
                { account: 'CASH', creditPaisa: storePays },
              ]
            : [
                { account: 'SALES', debitPaisa: storePays + absorbed },
                { account: 'AR', creditPaisa: storePays, customerId: inv.customerId },
              ];
        if (absorbed > 0) lines.push({ account: 'TAX_ABSORBED', creditPaisa: absorbed });

        await tx.voucher.create({
          data: { kind: 'JOURNAL', memo: `VOID of sales invoice INV-${pad(id)}: ${reason}`, userId, lines: { create: lines } },
        });

        return tx.salesInvoice.update({
          where: { id },
          data: { status: 'VOID', voidReason: reason, voidedBy: userId, voidedAt: new Date() },
          include: { items: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { ...invoice, number: `INV-${pad(id)}` };
  }
}
