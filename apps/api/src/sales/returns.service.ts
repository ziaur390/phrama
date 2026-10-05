import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import type { Disposition } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { withRetry } from '../prisma/with-retry';

/**
 * M8 returns. Per-line warehouse inspection sets the disposition:
 *   SALEABLE -> stock back to the invoice warehouse (sellable again)
 *   DAMAGED/EXPIRED -> stock to Quarantine (never sellable; claim candidates)
 * Customer credited pro-rata: net + charged tax; absorbed-tax claim reduced pro-rata.
 */

const pad = (n: number) => String(n).padStart(6, '0');
const QUARANTINE = 'Quarantine';

@Injectable()
export class SalesReturnService {
  constructor(private prisma: PrismaService, private finance: FinanceService) {}

  async postReturn(
    userId: string,
    dto: {
      invoiceId: number;
      memo?: string;
      items: { invoiceItemId: number; qty: number; disposition: Disposition }[];
    },
  ) {
    if (!dto.items?.length) throw new BadRequestException('Return needs at least one item');

    const ret = await withRetry(() => this.prisma.$transaction(
      async (tx) => {
        const invoice = await tx.salesInvoice.findUnique({ where: { id: dto.invoiceId }, include: { items: true } });
        if (!invoice) throw new NotFoundException('Unknown invoice');
        if (invoice.status === 'VOID') throw new BadRequestException('Cannot return against a void invoice');

        // cumulative returned per invoice item (over-return guard)
        const prior = await tx.salesReturnItem.groupBy({
          by: ['invoiceItemId'],
          where: { invoiceItemId: { not: null }, invoiceItem: { invoiceId: invoice.id } },
          _sum: { qty: true },
        });
        const returnedSoFar = new Map<number, number>();
        for (const row of prior) if (row.invoiceItemId != null) returnedSoFar.set(row.invoiceItemId, row._sum.qty ?? 0);

        const quarantine = await tx.warehouse.findFirst({ where: { kind: 'QUARANTINE' } });
        if (!quarantine) throw new BadRequestException('No quarantine warehouse exists');

        const stockDoc = await tx.stockDocument.create({ data: { kind: 'RETURN', userId } });
        const returnDoc = await tx.salesReturn.create({
          data: { invoiceId: invoice.id, customerId: invoice.customerId, warehouseId: invoice.warehouseId, userId, memo: dto.memo },
        });

        for (const line of dto.items) {
          if (line.qty <= 0) throw new BadRequestException('Return qty must be positive');
          const invItem = invoice.items.find((i) => i.id === line.invoiceItemId);
          if (!invItem) throw new BadRequestException(`Invoice item ${line.invoiceItemId} is not on this invoice`);
          const already = returnedSoFar.get(line.invoiceItemId) ?? 0;
          if (already + line.qty > invItem.qty)
            throw new BadRequestException(`Over-return on line ${line.invoiceItemId}: sold ${invItem.qty}, already returned ${already}, this return ${line.qty}`);

          const netUnit = Math.round(invItem.unitPricePaisa * (1 - invItem.discountPct / 100));
          const net = line.qty * netUnit;

          // CAREFUL: counters here handle rounding per returned chunk (round at whole-return level = documented pro-rata)
          const taxCharged = invItem.taxChargedPaisa;
          const taxAbsorbed = invItem.taxAbsorbedPaisa;
          const taxChargedProp = Math.round((taxCharged * line.qty) / invItem.qty);
          const taxAbsorbedProp = Math.round((taxAbsorbed * line.qty) / invItem.qty);

          await tx.salesReturnItem.create({
            data: {
              returnId: returnDoc.id,
              invoiceItemId: invItem.id,
              productId: invItem.productId,
              batchId: invItem.batchId, // same physical batch comes back
              qty: line.qty,
              unitNetPaisa: netUnit,
              taxChargedPropPaisa: taxChargedProp,
              taxAbsorbedPropPaisa: taxAbsorbedProp,
              disposition: line.disposition,
            },
          });

          // stock: saleable -> invoice warehouse; damaged/expired -> quarantine
          const targetWarehouse = line.disposition === 'SALEABLE' ? invoice.warehouseId : quarantine.id;
          await tx.stockMovement.create({
            data: { docId: stockDoc.id, productId: invItem.productId, batchId: invItem.batchId, warehouseId: targetWarehouse, kind: 'RETURN', delta: line.qty },
          });

          returnedSoFar.set(line.invoiceItemId, already + line.qty);
        }

        // money: reverse pro-rata per item (aggregate the reversal lines)
        const items = await tx.salesReturnItem.findMany({ where: { returnId: returnDoc.id } });
        const netTotal = items.reduce((s, i) => s + i.qty * i.unitNetPaisa, 0);
        const chargedTotal = items.reduce((s, i) => s + i.taxChargedPropPaisa, 0);
        const absorbedTotal = items.reduce((s, i) => s + i.taxAbsorbedPropPaisa, 0);

        // mirror of the invoice entry: Dr SALES (net+charged+absorbed), Cr AR/CASH (net+charged), Cr TAX_ABSORBED (absorbed)
        const lines: Prisma.JournalLineUncheckedCreateWithoutVoucherInput[] = [
          { account: 'SALES', debitPaisa: netTotal + chargedTotal + absorbedTotal },
          invoice.channel === 'COUNTER'
            ? { account: 'CASH', creditPaisa: netTotal + chargedTotal }
            : { account: 'AR', creditPaisa: netTotal + chargedTotal, customerId: invoice.customerId },
        ];
        if (absorbedTotal > 0) lines.push({ account: 'TAX_ABSORBED', creditPaisa: absorbedTotal });
        await tx.voucher.create({
          data: { kind: 'JOURNAL', memo: `Sales return RTN-${pad(returnDoc.id)} against INV-${pad(invoice.id)}`, userId, lines: { create: lines } },
        });

        return tx.salesReturn.findUnique({ where: { id: returnDoc.id }, include: { items: true } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ));
    return { ...ret!, number: `RTN-${pad(ret!.id)}` };
  }

  listReturns(filter: { invoiceId?: number; customerId?: string }) {
    return this.prisma.salesReturn
      .findMany({
        where: {
          ...(filter.invoiceId ? { invoiceId: filter.invoiceId } : {}),
          ...(filter.customerId ? { customerId: filter.customerId } : {}),
        },
        include: {
          invoice: { select: { id: true } },
          warehouse: { select: { name: true } },
          items: { include: { product: { select: { code: true, name: true } }, batch: { select: { batchNo: true } } } },
        },
        orderBy: { id: 'desc' },
      })
      .then((rs) => rs.map((r) => ({ ...r, number: `RTN-${pad(r.id)}` })));
  }
}
