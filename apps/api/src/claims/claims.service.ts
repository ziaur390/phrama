import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { Prisma } from '@prisma/client';
import { withRetry } from '../prisma/with-retry';

/**
 * M8 claims + company statements.
 * TAX_ABSORBED claims: statement of absorbed GST per company (product-wise,
 * split by store filer status, net of returns) -> company reimburses -> tracked
 * to money received. EXPIRY claims: quarantine stock returned to the company.
 * Write-off: unclaimed expired stock -> stock out + loss journal.
 */

const pad = (n: number) => String(n).padStart(6, '0');

@Injectable()
export class ClaimsService {
  constructor(private prisma: PrismaService, private finance: FinanceService) {}

  /** Absorbed-GST statement: product-wise qty + absorbed tax, split filer/non-filer, net of returns. */
  async taxStatement(companyId: string, from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const rows = await this.prisma.salesInvoiceItem.findMany({
      where: {
        isBonus: false,
        taxAbsorbedPaisa: { gt: 0 },
        invoice: { status: 'POSTED', date: { gte: fromDate, lte: toDate } },
        product: { companyId },
      },
      include: { invoice: { select: { customer: { select: { filerStatus: true } } } } },
    });

    // returns reduce what the company owes for those line items
    const returnedByItem = new Map<number, { absorbed: number; qty: number }>();
    const returnRows = await this.prisma.salesReturnItem.findMany({
      where: { invoiceItemId: { not: null } },
      include: { invoiceItem: { include: { product: { select: { companyId: true } } } } },
    });
    for (const r of returnRows) {
      if (r.invoiceItem?.product.companyId !== companyId) continue;
      if (r.invoiceItemId) {
        const cur = returnedByItem.get(r.invoiceItemId) ?? { absorbed: 0, qty: 0 };
        cur.absorbed += r.taxAbsorbedPropPaisa;
        cur.qty += r.qty;
        returnedByItem.set(r.invoiceItemId, cur);
      }
    }

    const grouped = new Map<string, { productId: string; filerStatus: string; qty: number; absorbedPaisa: number }>();
    for (const row of rows) {
      const returned = returnedByItem.get(row.id) ?? { absorbed: 0, qty: 0 };
      const key = `${row.productId}|${row.invoice.customer.filerStatus}`;
      const g = grouped.get(key) ?? { productId: row.productId, filerStatus: row.invoice.customer.filerStatus, qty: 0, absorbedPaisa: 0 };
      g.qty += row.qty - returned.qty;
      g.absorbedPaisa += row.taxAbsorbedPaisa - returned.absorbed;
      grouped.set(key, g);
    }

    const productIds = [...new Set([...grouped.values()].map((g) => g.productId))];
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, code: true, name: true } });
    const pmap = new Map(products.map((p) => [p.id, p]));

    const lines = [...grouped.values()].map((g) => ({
      ...g,
      productCode: pmap.get(g.productId)?.code,
      productName: pmap.get(g.productId)?.name,
    }));
    const totalAbsorbedPaisa = lines.reduce((s, l) => s + l.absorbedPaisa, 0);

    return { companyId, from, to, lines, totalAbsorbedPaisa };
  }

  /** Statement -> OPEN claim for the company. */
  async claimFromStatement(userId: string, companyId: string, from: string, to: string, memo?: string) {
    const statement = await this.taxStatement(companyId, from, to);
    if (statement.totalAbsorbedPaisa <= 0) throw new BadRequestException('No absorbed tax to claim in this range');
    const c = await this.prisma.companyClaim.create({
      data: { companyId, kind: 'TAX_ABSORBED', amountPaisa: statement.totalAbsorbedPaisa, memo: `${memo ?? ''} [statement ${from}..${to}]` },
    });
    return { ...c, number: `CL-${pad(c.id)}`, statement };
  }

  /** Expiry claim: quarantine stock goes back to the company; claim asset posted atomically. */
  async claimExpiry(userId: string, companyId: string, batchId: string, qty: number) {
    if (qty <= 0) throw new BadRequestException('qty must be positive');
    return withRetry(() => this.prisma.$transaction(
      async (tx) => {
        const quarantine = await tx.warehouse.findFirst({ where: { kind: 'QUARANTINE' } });
        if (!quarantine) throw new BadRequestException('No quarantine warehouse');
        const stock = await tx.stockMovement.aggregate({
          where: { batchId, warehouseId: quarantine.id },
          _sum: { delta: true },
        });
        if ((stock._sum.delta ?? 0) < qty)
          throw new BadRequestException(`Insufficient quarantine stock: have ${stock._sum.delta ?? 0}, claiming ${qty}`);
        const batch = await tx.batch.findUnique({ where: { id: batchId } });
        if (!batch) throw new NotFoundException('Unknown batch');

        const doc = await tx.stockDocument.create({ data: { kind: 'RETURN_OUT', reason: `Expired batch ${batch.batchNo} returned to company`, userId } });
        await tx.stockMovement.create({
          data: { docId: doc.id, productId: batch.productId, batchId, warehouseId: quarantine.id, kind: 'RETURN_OUT', delta: -qty },
        });

        const claim = await tx.companyClaim.create({
          data: { companyId, kind: 'EXPIRY', amountPaisa: qty * batch.costPricePaisa, memo: `Expired batch ${batch.batchNo} returned` },
        });

        await this.finance.insertVoucher(tx, userId, {
          kind: 'JOURNAL',
          memo: `Expiry claim CL-${pad(claim.id)} (batch ${batch.batchNo}) to company`,
          lines: [
            { account: 'EXPIRY_CLAIMS', debitPaisa: qty * batch.costPricePaisa },
            { account: 'INVENTORY', creditPaisa: qty * batch.costPricePaisa },
          ],
        });
        return tx.companyClaim.findUnique({ where: { id: claim.id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    ).then((c) => ({ ...c!, number: `CL-${pad(c!.id)}` }));
  }

  listClaims(filter: { companyId?: string; status?: 'OPEN' | 'SENT' | 'PAID' }) {
    return this.prisma.companyClaim
      .findMany({
        where: {
          ...(filter.companyId ? { companyId: filter.companyId } : {}),
          ...(filter.status ? { status: filter.status } : {}),
        },
        include: { company: { select: { code: true, name: true } } },
        orderBy: { id: 'desc' },
      })
      .then((cs) => cs.map((c) => ({ ...c, number: `CL-${pad(c.id)}` })));
  }

  async sendClaim(id: number) {
    const claim = await this.prisma.companyClaim.findUnique({ where: { id } });
    if (!claim) throw new NotFoundException();
    if (claim.status !== 'OPEN') throw new BadRequestException(`Claim is ${claim.status}, not OPEN`);
    const c = await this.prisma.companyClaim.update({ where: { id }, data: { status: 'SENT', sentAt: new Date() } });
    return { ...c, number: `CL-${pad(c.id)}` };
  }

  /** Money received from the company: cash/bank voucher against the claim account. */
  async receiveClaim(userId: string, id: number, amountPaisa: number, mode: 'CASH' | 'BANK') {
    if (amountPaisa <= 0) throw new BadRequestException('amount must be positive');
    return withRetry(() => this.prisma.$transaction(
      async (tx) => {
        const claim = await tx.companyClaim.findUnique({ where: { id } });
        if (!claim) throw new NotFoundException();
        if (claim.status === 'PAID') throw new BadRequestException('Claim already paid');
        const account = claim.kind === 'TAX_ABSORBED' ? ('TAX_ABSORBED' as const) : ('EXPIRY_CLAIMS' as const);
        await this.finance.insertVoucher(tx, userId, {
          kind: 'JOURNAL',
          memo: `Claim CL-${pad(id)} recovered from company (${mode})`,
          lines: [
            { account: mode as never, debitPaisa: amountPaisa },
            { account, creditPaisa: amountPaisa },
          ],
        });
        const c = await tx.companyClaim.update({
          where: { id },
          data: { status: 'PAID', paidAt: new Date(), paidAmountPaisa: amountPaisa },
        });
        return c;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    ).then((c) => ({ ...c, number: `CL-${pad(c.id)}` }));
  }

  /** Unclaimed expired stock: write-off adjustment + loss journal, one transaction. */
  async writeOff(userId: string, batchId: string, warehouseId: string, qty: number, reason: string) {
    if (!reason.trim()) throw new BadRequestException('reason is mandatory on write-off');
    if (qty <= 0) throw new BadRequestException('qty must be positive');
    return withRetry(() => this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.batch.findUnique({ where: { id: batchId } });
        if (!batch) throw new NotFoundException('Unknown batch');
        const stock = await tx.stockMovement.aggregate({ where: { batchId, warehouseId }, _sum: { delta: true } });
        if ((stock._sum.delta ?? 0) < qty) {
          throw new BadRequestException(`Insufficient stock: have ${stock._sum.delta ?? 0}, writing off ${qty}`);
        }

        const doc = await tx.stockDocument.create({ data: { kind: 'ADJUSTMENT', reason, userId } });
        await tx.stockMovement.create({
          data: { docId: doc.id, productId: batch.productId, batchId, warehouseId, kind: 'ADJUSTMENT', delta: -qty },
        });

        const loss = qty * batch.costPricePaisa;
        await this.finance.insertVoucher(tx, userId, {
          kind: 'JOURNAL',
          memo: `Expired write-off (batch ${batch.batchNo}): ${reason}`,
          lines: [
            { account: 'EXPENSE', debitPaisa: loss },
            { account: 'INVENTORY', creditPaisa: loss },
          ],
        });
        return { ok: true, batchId, qty, lossPaisa: loss, reason };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }
}
