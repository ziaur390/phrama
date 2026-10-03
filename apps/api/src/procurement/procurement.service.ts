import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import type { PurchaseOrderStatus } from '@prisma/client';

/**
 * M6 procurement: PurchaseOrder -> StockReceipt -> supplier payable.
 * One transaction on receipt POST: batch find-or-create + stock IN movements +
 * journal (Dr INVENTORY / Cr AP) + PO status advance.
 * Ordered 1000, received 980 -> PARTIAL, short 20 tracked; nothing silently edited.
 */

const pad = (n: number) => String(n).padStart(6, '0');

@Injectable()
export class ProcurementService {
  constructor(private prisma: PrismaService, private finance: FinanceService) {}

  async createPO(userId: string, dto: { supplierId: string; expectedDate?: string; memo?: string; lines: { productId: string; orderedQty: number; unitCostPaisa: number }[] }) {
    if (!dto.lines?.length) throw new BadRequestException('PO needs at least one line');
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) throw new NotFoundException('Unknown supplier');

    const po = await this.prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          supplierId: dto.supplierId,
          userId,
          memo: dto.memo,
          ...(dto.expectedDate ? { expectedDate: new Date(dto.expectedDate) } : {}),
          items: { create: dto.lines.map((l) => ({ productId: l.productId, orderedQty: l.orderedQty, unitCostPaisa: l.unitCostPaisa })) },
        },
        include: { items: true },
      });
      return created;
    });
    return { ...po, number: `PO-${pad(po.id)}` };
  }

  listPOs(status?: PurchaseOrderStatus) {
    return this.prisma.purchaseOrder
      .findMany({
        where: status ? { status } : undefined,
        include: {
          supplier: { include: { company: { select: { code: true, name: true } } } },
          items: { include: { product: { select: { code: true, name: true } } } },
        },
        orderBy: { id: 'desc' },
      })
      .then((pos) => pos.map((po) => ({ ...po, number: `PO-${pad(po.id)}` })));
  }

  async getPO(id: number) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { include: { company: { select: { code: true, name: true } } } },
        items: { include: { product: { select: { code: true, name: true } } } },
        receipts: { include: { items: { include: { batch: true } }, warehouse: { select: { name: true } } } },
      },
    });
    if (!po) throw new NotFoundException();
    const receivedByProduct = new Map<string, number>();
    for (const r of po.receipts) for (const i of r.items) receivedByProduct.set(i.productId, (receivedByProduct.get(i.productId) ?? 0) + i.receivedQty);
    return {
      ...po,
      number: `PO-${pad(po.id)}`,
      items: po.items.map((i) => ({ ...i, receivedQty: receivedByProduct.get(i.productId) ?? 0 })),
    };
  }

  /**
   * Post a Stock Receipt against a PO - goods AND money move in one transaction.
   */
  async createReceipt(
    userId: string,
    dto: {
      poId: number;
      warehouseId: string;
      memo?: string;
      lines: { productId: string; batchNo: string; expiry: string; receivedQty: number; unitCostPaisa: number }[];
    },
  ) {
    if (!dto.lines?.length) throw new BadRequestException('Receipt needs at least one line');

    const receipt = await this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({ where: { id: dto.poId }, include: { items: true } });
      if (!po) throw new NotFoundException('Unknown PO');
      if (po.status === 'RECEIVED') throw new BadRequestException('PO already fully received');

      // cumulative received so far (this PO) for over-receipt guard
      const prior = await tx.stockReceiptItem.groupBy({
        where: { receipt: { poId: dto.poId } },
        by: ['productId'],
        _sum: { receivedQty: true },
      });
      const receivedSoFar = new Map<string, number>();
      for (const row of prior) receivedSoFar.set(row.productId, row._sum.receivedQty ?? 0);

      // per-line batch find-or-create + movement
      let totalPaisa = 0;
      const lineRows: { productId: string; batchId: string; receivedQty: number; unitCostPaisa: number }[] = [];

      const stockDoc = await tx.stockDocument.create({
        data: { kind: 'RECEIPT', reason: dto.memo, userId },
      });

      const receiptRow = await tx.stockReceipt.create({
        data: { poId: po.id, supplierId: po.supplierId, warehouseId: dto.warehouseId, userId, memo: dto.memo, stockDocId: stockDoc.id },
      });

      for (const l of dto.lines) {
        if (l.receivedQty <= 0) throw new BadRequestException('receivedQty must be positive');
        const poItem = po.items.find((i) => i.productId === l.productId);
        if (!poItem) throw new BadRequestException(`Product ${l.productId} is not on this PO`);
        const already = receivedSoFar.get(l.productId) ?? 0;
        if (already + l.receivedQty > poItem.orderedQty)
          throw new BadRequestException(
            `Over-receipt: ordered ${poItem.orderedQty}, already received ${already}, this receipt ${l.receivedQty}`,
          );

        const batch = await tx.batch.upsert({
          where: { productId_batchNo: { productId: l.productId, batchNo: l.batchNo } },
          create: { productId: l.productId, batchNo: l.batchNo, expiry: new Date(l.expiry), costPricePaisa: l.unitCostPaisa },
          update: {},
        });

        await tx.stockMovement.create({
          data: { docId: stockDoc.id, productId: l.productId, batchId: batch.id, warehouseId: dto.warehouseId, kind: 'RECEIPT', delta: l.receivedQty },
        });

        receivedSoFar.set(l.productId, already + l.receivedQty);
        totalPaisa += l.receivedQty * l.unitCostPaisa;
        lineRows.push({ productId: l.productId, batchId: batch.id, receivedQty: l.receivedQty, unitCostPaisa: l.unitCostPaisa });
      }

      // money: Dr INVENTORY / Cr AP[supplier] - supplier payable grows by receipt value
      await tx.stockReceiptItem.createMany({
        data: lineRows.map((l) => ({ receiptId: receiptRow.id, ...l })),
      });

      const voucher = await this.finance.insertVoucher(tx, userId, {
        kind: 'JOURNAL',
        memo: `Stock receipt SR-${pad(receiptRow.id)} against PO-${pad(po.id)}`,
        lines: [
          { account: 'INVENTORY', debitPaisa: totalPaisa },
          { account: 'AP', creditPaisa: totalPaisa, supplierId: po.supplierId },
        ],
      });

      // PO status: RECEIVED when every item is complete, else PARTIAL
      const fullyReceived = po.items.every((i) => (receivedSoFar.get(i.productId) ?? 0) >= i.orderedQty);
      const status: PurchaseOrderStatus = fullyReceived ? 'RECEIVED' : 'PARTIAL';
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status } });

      return tx.stockReceipt.findUnique({ where: { id: receiptRow.id }, include: { items: true } });
    });

    return { ...receipt!, number: `SR-${pad(receipt!.id)}` };
  }

  listReceipts(poId?: number) {
    return this.prisma.stockReceipt
      .findMany({
        where: poId ? { poId } : undefined,
        include: {
          po: { select: { id: true, status: true } },
          supplier: { include: { company: { select: { code: true } } } },
          warehouse: { select: { name: true } },
          items: { include: { product: { select: { code: true, name: true } }, batch: { select: { batchNo: true, expiry: true } } } },
        },
        orderBy: { id: 'desc' },
      })
      .then((rs) => rs.map((r) => ({ ...r, number: `SR-${pad(r.id)}`, poNumber: `PO-${pad(r.poId)}` })));
  }
}
