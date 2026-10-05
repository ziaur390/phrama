import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Account, Prisma, VoucherKind } from '@prisma/client';

/**
 * Money ledger (M4). A voucher is the double-entry document; its lines balance.
 * Receipts:  Dr CASH/BANK,  Cr AR[customer]
 * Payments:  Dr AP[supplier], Cr CASH/BANK
 * Expenses:  Dr EXPENSE,   Cr CASH/BANK
 * Journals:  arbitrary balanced lines (opening balances etc.)
 * Balances always computed from history - never stored.
 */

export interface VoucherInput {
  kind: VoucherKind;
  date?: string;
  memo?: string;
  customerId?: string; // receipts
  supplierId?: string; // payments
  paidFrom?: 'CASH' | 'BANK'; // expenses
  amountPaisa?: number; // non-journal kinds
  lines?: JournalLineInput[]; // kind=JOURNAL
}

export interface JournalLineInput {
  account: Account;
  debitPaisa?: number;
  creditPaisa?: number;
  customerId?: string;
  supplierId?: string;
  memo?: string;
}

const PREFIX: Record<VoucherKind, string> = {
  CASH_RECEIPT: 'CR',
  BANK_RECEIPT: 'BR',
  CASH_PAYMENT: 'CP',
  BANK_PAYMENT: 'BP',
  EXPENSE: 'EX',
  JOURNAL: 'JV',
  CREDIT_NOTE: 'CN',
  DEBIT_NOTE: 'DN',
};

export function voucherNumber(kind: VoucherKind, id: number): string {
  return `${PREFIX[kind]}-${String(id).padStart(6, '0')}`;
}

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  /** Post a voucher of any kind. One transaction: voucher + balanced lines. */
  async postVoucher(
    userId: string,
    input: VoucherInput,
  ) {
    const voucher = await this.prisma.$transaction((tx) => this.insertVoucher(tx, userId, input));
    return { ...voucher!, number: voucherNumber(input.kind, voucher!.id) };
  }

  /** Used by other modules (procurement, sales) that must post money inside THEIR transaction. */
  async insertVoucher(tx: Prisma.TransactionClient, userId: string, input: VoucherInput) {
    const lines = this.buildLines(input);
    this.assertBalanced(lines);
    const v = await tx.voucher.create({
      data: { kind: input.kind, memo: input.memo, userId, ...(input.date ? { date: new Date(input.date) } : {}) },
    });
    await tx.journalLine.createMany({ data: lines.map((l) => ({ ...l, voucherId: v.id })) });
    return tx.voucher.findUnique({ where: { id: v.id }, include: { lines: true } });
  }

  /** Built kinds construct their two lines; JOURNAL takes caller lines. */
  private buildLines(input: VoucherInput): JournalLineInput[] {
    const amt = input.amountPaisa;
    if (input.kind === 'CASH_RECEIPT' || input.kind === 'BANK_RECEIPT') {
      this.require(amt && amt > 0, 'amountPaisa must be positive');
      this.require(input.customerId, 'customerId required on receipts');
      const cash: Account = input.kind === 'CASH_RECEIPT' ? 'CASH' : 'BANK';
      return [
        { account: cash, debitPaisa: amt, memo: input.memo },
        { account: 'AR', creditPaisa: amt, customerId: input.customerId, memo: input.memo },
      ];
    }
    if (input.kind === 'CASH_PAYMENT' || input.kind === 'BANK_PAYMENT') {
      this.require(amt && amt > 0, 'amountPaisa must be positive');
      this.require(input.supplierId, 'supplierId required on payments');
      const cash: Account = input.kind === 'CASH_PAYMENT' ? 'CASH' : 'BANK';
      return [
        { account: 'AP', debitPaisa: amt, supplierId: input.supplierId, memo: input.memo },
        { account: cash, creditPaisa: amt, memo: input.memo },
      ];
    }
    if (input.kind === 'EXPENSE') {
      this.require(amt && amt > 0, 'amountPaisa must be positive');
      const from: Account = input.paidFrom === 'BANK' ? 'BANK' : 'CASH';
      return [
        { account: 'EXPENSE', debitPaisa: amt, memo: input.memo },
        { account: from, creditPaisa: amt, memo: input.memo },
      ];
    }
    // JOURNAL: caller-provided lines
    this.require((input.lines?.length ?? 0) >= 2, 'journal needs at least 2 lines');
    return input.lines!;
  }

  /** Dr must equal Cr; each line one-sided and positive; AR/AP lines carry their party. */
  private assertBalanced(lines: JournalLineInput[]) {
    let dr = 0;
    let cr = 0;
    for (const l of lines) {
      const d = l.debitPaisa ?? 0;
      const c = l.creditPaisa ?? 0;
      this.require(d > 0 || c > 0, 'every journal line needs a debit or credit');
      this.require(d === 0 || c === 0, 'a line cannot be both debit and credit');
      this.require(d >= 0 && c >= 0, 'amounts must be positive');
      if (l.account === 'AR') this.require(l.customerId, 'AR lines need customerId');
      if (l.account === 'AP') this.require(l.supplierId, 'AP lines need supplierId');
      dr += d;
      cr += c;
    }
    this.require(dr === cr, `journal does not balance: Dr ${dr} vs Cr ${cr}`);
  }

  private require(cond: unknown, msg: string): asserts cond {
    if (!cond) throw new BadRequestException(msg);
  }

  listVouchers(filter: { kind?: VoucherKind; customerId?: string; supplierId?: string }) {
    return this.prisma.voucher.findMany({
      where: {
        ...(filter.kind ? { kind: filter.kind } : {}),
        lines: {
          some: {
            ...(filter.customerId ? { customerId: filter.customerId } : {}),
            ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
          },
        },
      },
      include: { lines: true },
      orderBy: { id: 'desc' },
    }).then((vs) => vs.map((v) => ({ ...v, number: voucherNumber(v.kind, v.id) })));
  }

  /** Customer sub-ledger: AR lines with running balance (positive = owes us). */
  async customerLedger(customerId: string) {
    const lines = await this.prisma.journalLine.findMany({
      where: { account: 'AR', customerId },
      include: { voucher: { select: { kind: true, date: true, memo: true } } },
      orderBy: { id: 'asc' },
    });
    let balance = 0;
    const rows = lines.map((l) => {
      balance += l.debitPaisa - l.creditPaisa;
      return { ...l, running: balance };
    });
    return { balance, lines: rows };
  }

  /** Supplier sub-ledger: AP lines with running balance (positive = we owe). */
  async supplierLedger(supplierId: string) {
    const lines = await this.prisma.journalLine.findMany({
      where: { account: 'AP', supplierId },
      include: { voucher: { select: { kind: true, date: true, memo: true } } },
      orderBy: { id: 'asc' },
    });
    let balance = 0;
    const rows = lines.map((l) => {
      balance += l.creditPaisa - l.debitPaisa;
      return { ...l, running: balance };
    });
    return { balance, lines: rows };
  }

  /** Cash book: CASH + BANK lines with both running balances. */
  async cashBook() {
    const lines = await this.prisma.journalLine.findMany({
      where: { account: { in: ['CASH', 'BANK'] } },
      include: { voucher: { select: { kind: true, date: true, memo: true } } },
      orderBy: { id: 'asc' },
    });
    let cash = 0;
    let bank = 0;
    const rows = lines.map((l) => {
      if (l.account === 'CASH') cash += l.debitPaisa - l.creditPaisa;
      else bank += l.debitPaisa - l.creditPaisa;
      return { ...l, running: l.account === 'CASH' ? cash : bank };
    });
    return { cashBalance: cash, bankBalance: bank, lines: rows };
  }
}
