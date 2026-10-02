import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma, StockDocKind, StockMoveKind } from '@prisma/client';

export interface StockLineInput {
  productId: string;
  batchId: string;
  qty: number;
}

export interface AdjustLineInput {
  productId: string;
  batchId: string;
  delta: number; // signed: -8 = 8 units gone (damage/write-off), +3 = found stock
}

interface MoveSpec {
  productId: string;
  batchId: string;
  warehouseId: string;
  kind: StockMoveKind;
  delta: number;
}

@Injectable()
export class StockLedgerService {
  constructor(private prisma: PrismaService) {}

  /** Current stock computed from history — never a stored qty column. */
  async currentStock(filter: { productId?: string; batchId?: string; warehouseId?: string }) {
    const rows = await this.prisma.stockMovement.groupBy({
      by: ['productId', 'batchId', 'warehouseId'],
      where: {
        ...(filter.productId ? { productId: filter.productId } : {}),
        ...(filter.batchId ? { batchId: filter.batchId } : {}),
        ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
      },
      _sum: { delta: true },
    });
    return rows
      .filter((r) => r._sum.delta !== 0)
      .map((r) => ({
        productId: r.productId,
        batchId: r.batchId,
        warehouseId: r.warehouseId,
        qty: r._sum.delta ?? 0,
      }));
  }

  /** Full movement history — answers "why is stock what it is?" line by line. */
  movementHistory(filter: { productId?: string; batchId?: string; warehouseId?: string }) {
    return this.prisma.stockMovement.findMany({
      where: {
        ...(filter.productId ? { productId: filter.productId } : {}),
        ...(filter.batchId ? { batchId: filter.batchId } : {}),
        ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
      },
      include: {
        doc: { select: { kind: true, reason: true, createdAt: true } },
        product: { select: { code: true, name: true } },
        batch: { select: { batchNo: true, expiry: true } },
        warehouse: { select: { name: true, kind: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Opening Stock Entry — day-one clean start, one movement per batch line. */
  postOpening(userId: string, warehouseId: string, lines: StockLineInput[]) {
    const moves = lines.map((l) => ({
      productId: l.productId,
      batchId: l.batchId,
      warehouseId,
      kind: 'OPENING' as const,
      delta: l.qty,
    }));
    return this.postDoc(userId, 'OPENING', undefined, moves);
  }

  /** Transfer between warehouses. Quarantine stock can only move between quarantine stores. */
  async postTransfer(userId: string, fromWarehouseId: string, toWarehouseId: string, lines: StockLineInput[]) {
    if (fromWarehouseId === toWarehouseId) throw new BadRequestException('from = to');

    const [from, to] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { id: fromWarehouseId } }),
      this.prisma.warehouse.findUnique({ where: { id: toWarehouseId } }),
    ]);
    if (!from || !to) throw new BadRequestException('Unknown warehouse');
    if (from.kind === 'QUARANTINE' && to.kind !== 'QUARANTINE')
      throw new ForbiddenException('Quarantine stock can only move between quarantine stores');

    // ponytail: simple groupBy check inside the write transaction; row-level lock if concurrent overdraft ever bites
    const shortage = await this.shortage(fromWarehouseId, lines);
    if (shortage) throw new BadRequestException(`Insufficient stock at source: ${shortage}`);

    const moves: MoveSpec[] = [
      ...lines.map((l) => ({ productId: l.productId, batchId: l.batchId, warehouseId: fromWarehouseId, kind: 'TRANSFER_OUT' as const, delta: -l.qty })),
      ...lines.map((l) => ({ productId: l.productId, batchId: l.batchId, warehouseId: toWarehouseId, kind: 'TRANSFER_IN' as const, delta: l.qty })),
    ];
    return this.postDoc(userId, 'TRANSFER', undefined, moves);
  }

  /** Stock Adjustment: the 480-vs-500 answer. Mandatory reason, signed deltas. */
  async postAdjustment(userId: string, warehouseId: string, reason: string, lines: AdjustLineInput[]) {
    if (!reason.trim()) throw new BadRequestException('reason is mandatory on adjustments');
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new BadRequestException('Unknown warehouse');

    const shortage = await this.shortage(warehouseId, lines.filter((l) => l.delta < 0).map((l) => ({ ...l, qty: -l.delta })));
    if (shortage) throw new BadRequestException(`Adjustment would overdraw stock: ${shortage}`);

    const moves: MoveSpec[] = lines.map((l) => ({
      productId: l.productId,
      batchId: l.batchId,
      warehouseId,
      kind: 'ADJUSTMENT' as const,
      delta: l.delta,
    }));
    return this.postDoc(userId, 'ADJUSTMENT', reason, moves);
  }

  /** Return-to-quarantine: damaged/expired stock goes to a QUARANTINE-kind warehouse (M8 builds on this). */
  async postToQuarantine(userId: string, fromWarehouseId: string, lines: StockLineInput[]) {
    const quarantine = await this.prisma.warehouse.findFirst({ where: { kind: 'QUARANTINE' } });
    if (!quarantine) throw new BadRequestException('No quarantine warehouse exists');
    return this.postTransfer(userId, fromWarehouseId, quarantine.id, lines);
  }

  /** Shared writer: one transaction, doc + movements, batch ownership validated per line. */
  private async postDoc(userId: string, kind: StockDocKind, reason: string | undefined, moves: MoveSpec[]) {
    if (moves.length === 0) throw new BadRequestException('No lines');

    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.stockDocument.create({ data: { kind, reason, userId } });
      for (const m of moves) {
        if (m.delta === 0) throw new BadRequestException('Movement with qty 0');
        const batch = await tx.batch.findUnique({ where: { id: m.batchId }, select: { productId: true } });
        if (!batch) throw new BadRequestException(`Unknown batch ${m.batchId}`);
        if (batch.productId !== m.productId)
          throw new BadRequestException(`Batch ${m.batchId} does not belong to product ${m.productId}`);
        await tx.stockMovement.create({
          data: {
            docId: doc.id,
            productId: m.productId,
            batchId: m.batchId,
            warehouseId: m.warehouseId,
            kind: m.kind,
            delta: m.delta,
          },
        });
      }
      return tx.stockDocument.findUnique({ where: { id: doc.id }, include: { movements: true } });
    });
  }

  /** Returns reason string if stock insufficient for any line, else null. Also validates batch ownership. */
  private async shortage(
    warehouseId: string,
    lines: { productId: string; batchId: string; qty: number }[],
  ): Promise<string | null> {
    const relevant = lines.filter((l) => l.qty > 0);
    if (!relevant.length) return null;
    // ownership first — right error for the wrong batch before any stock math
    for (const l of relevant) {
      const b = await this.prisma.batch.findUnique({ where: { id: l.batchId }, select: { productId: true } });
      if (!b) return `unknown batch ${l.batchId}`;
      if (b.productId !== l.productId) return `batch ${l.batchId} does not belong to product ${l.productId}`;
    }
    const rows = await this.prisma.stockMovement.groupBy({
      by: ['productId', 'batchId'],
      where: {
        warehouseId,
        OR: relevant.map((l) => ({ productId: l.productId, batchId: l.batchId })),
      },
      _sum: { delta: true },
    });
    for (const l of relevant) {
      const row = rows.find((r) => r.productId === l.productId && r.batchId === l.batchId);
      const have = row?._sum.delta ?? 0;
      if (have < l.qty) return `batch ${l.batchId} have ${have}, need ${l.qty}`;
    }
    return null;
  }
}
