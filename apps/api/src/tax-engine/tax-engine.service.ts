import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CustomerFilerStatus } from '@prisma/client';

export interface LineInput {
  lineId: string;
  companyId: string;
  qty: number;
  unitPriceKs: bigint;
  customerFilerStatus: CustomerFilerStatus;
  invoiceDate: Date;
}

export interface LineTaxResult {
  lineId: string;
  taxChargedKs: bigint; // added to what the store pays (STRICT companies)
  taxAbsorbedKs: bigint; // tracked for company reimbursement (ABSORBING companies)
}

/** Millis-based rounding: money is integer paisa-millis, no floats. */
function pct(amountKs: bigint, ratePct: number): bigint {
  // amount * rate/100, rounding half-up at millis precision
  const millis = (amountKs * BigInt(Math.round(ratePct * 1000))) / 100_000n;
  const remainder = (amountKs * BigInt(Math.round(ratePct * 1000))) % 100_000n;
  return remainder >= 50_000n ? millis + 1n : millis;
}

@Injectable()
export class TaxEngineService {
  constructor(private prisma: PrismaService) {}

  /**
   * Rule chain (FR-4): company policy on invoice date × customer filer status × dated rate.
   * STRICT  → tax added to store's bill.
   * ABSORB  → tax NOT charged to store; tracked per company + filer status for statements.
   */
  async computeLine(input: LineInput): Promise<LineTaxResult> {
    const policyRow = await this.prisma.taxPolicyHistory.findFirst({
      where: { companyId: input.companyId, effectiveFrom: { lte: input.invoiceDate } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!policyRow) throw new NotFoundException(`No tax policy for company ${input.companyId} effective ${input.invoiceDate.toISOString()}`);

    const rateRow = await this.prisma.taxRate.findFirst({
      where: { kind: input.customerFilerStatus, effectiveFrom: { lte: input.invoiceDate } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!rateRow) throw new BadRequestException(`No tax rate for ${input.customerFilerStatus} effective ${input.invoiceDate.toISOString()}`);

    const lineValueKs = input.unitPriceKs * BigInt(input.qty);
    const taxKs = pct(lineValueKs, Number(rateRow.ratePct));

    if (policyRow.policy === 'STRICT') {
      return { lineId: input.lineId, taxChargedKs: taxKs, taxAbsorbedKs: 0n };
    }
    return { lineId: input.lineId, taxChargedKs: 0n, taxAbsorbedKs: taxKs };
  }
}
