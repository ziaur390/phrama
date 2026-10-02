import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CustomerFilerStatus } from '@prisma/client';

export interface LineInput {
  lineId: string;
  companyId: string;
  qty: number;
  unitPricePaisa: number;
  customerFilerStatus: CustomerFilerStatus;
  invoiceDate: Date;
}

export interface LineTaxResult {
  lineId: string;
  taxChargedPaisa: number; // added to what the store pays (STRICT companies)
  taxAbsorbedPaisa: number; // tracked for company reimbursement (ABSORBING companies)
}

/** Paisa-based rounding: money is integer paisa, no floats. Half-up to whole paisa. */
function pct(amountPaisa: number, ratePct: number): number {
  const raw = (amountPaisa * ratePct) / 100;
  return Math.round(raw);
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

    const lineValuePaisa = input.unitPricePaisa * input.qty;
    const taxPaisa = pct(lineValuePaisa, Number(rateRow.ratePct));

    if (policyRow.policy === 'STRICT') {
      return { lineId: input.lineId, taxChargedPaisa: taxPaisa, taxAbsorbedPaisa: 0 };
    }
    return { lineId: input.lineId, taxChargedPaisa: 0, taxAbsorbedPaisa: taxPaisa };
  }
}
