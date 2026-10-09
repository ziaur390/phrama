import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * M4 e2e - money ledger on a real Postgres.
 * Opening balances -> receipts -> payments -> expenses -> books.
 * Dr = Cr always; balances always computed from history; documents append-only.
 */
describe('Finance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const suffix = Date.now().toString(36);
  let customerId: string;
  let supplierId: string;
  let bookBefore: { cashBalance: number; bankBalance: number };

  const post = (path: string, body?: any) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`).send(body);
  const get = (path: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    token = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'admin', password: 'phrama123' })).body.accessToken;

    // fixtures: one customer, one supplier
    const customer = await post('/customers', { code: `FIN${suffix}`, name: 'Noor Medical Store', type: 'REGULAR', filerStatus: 'FILER' });
    customerId = customer.body.id;
    const company = await post('/companies', { code: `FC${suffix}`, name: 'Finance Test Co' });
    const supplier = await post('/suppliers', { companyId: company.body.id });
    supplierId = supplier.body.id;

    // global cash-book snapshot BEFORE this suite posts anything (dev db accumulates across runs)
    bookBefore = (await get('/finance/cash-book')).body;
  }, 30_000);

  afterAll(async () => { await app.close(); });

  const bal = async () => (await get(`/finance/customers/${customerId}/ledger`)).body.balance;

  it('opening balances post as a balanced journal: Dr AR / Cr OPENING_EQUITY', async () => {
    const res = await post('/finance/vouchers', {
      kind: 'JOURNAL',
      memo: 'opening balances',
      lines: [
        { account: 'AR', debitPaisa: 12_500, customerId },
        { account: 'OPENING_EQUITY', creditPaisa: 12_500 },
      ],
    }).expect(201);
    expect(res.body.number).toMatch(/^JV-\d{6}$/);
    expect(await bal()).toBe(12_500);
  });

  it('unbalanced journal is rejected', async () => {
    await post('/finance/vouchers', {
      kind: 'JOURNAL',
      lines: [
        { account: 'AR', debitPaisa: 100, customerId },
        { account: 'OPENING_EQUITY', creditPaisa: 99 },
      ],
    }).expect(400);
  });

  it('AR line without customerId is rejected', async () => {
    await post('/finance/vouchers', {
      kind: 'JOURNAL',
      lines: [
        { account: 'AR', debitPaisa: 100 },
        { account: 'OPENING_EQUITY', creditPaisa: 100 },
      ],
    }).expect(400);
  });

  it('cash receipt reduces customer balance and builds the cash book', async () => {
    const res = await post('/finance/vouchers', {
      kind: 'CASH_RECEIPT',
      customerId,
      amountPaisa: 5_000,
      memo: 'recovery at shop',
    }).expect(201);
    expect(res.body.number).toMatch(/^CR-\d{6}$/);
    expect(res.body.lines.map((l: any) => [l.account, l.debitPaisa, l.creditPaisa])).toEqual(
      expect.arrayContaining([['CASH', 5_000, 0], ['AR', 0, 5_000]]),
    );
    expect(await bal()).toBe(7_500);
  });

  it('bank receipt: Dr BANK / Cr AR', async () => {
    await post('/finance/vouchers', { kind: 'BANK_RECEIPT', customerId, amountPaisa: 2_500 }).expect(201);
    expect(await bal()).toBe(5_000);
  });

  it('supplier payable posts and payment reduces it', async () => {
    // supplier opening: Dr INVENTORY? no - payable opening via journal: Dr OPENING_EQUITY? no.
    // payable = we owe: Cr AP. Opening: Dr PURCHASE-equivalent... use JOURNAL with Dr INVENTORY / Cr AP.
    await post('/finance/vouchers', {
      kind: 'JOURNAL',
      memo: 'supplier opening payable',
      lines: [
        { account: 'INVENTORY', debitPaisa: 8_000 },
        { account: 'AP', creditPaisa: 8_000, supplierId },
      ],
    }).expect(201);

    let sup = (await get(`/finance/suppliers/${supplierId}/ledger`)).body;
    expect(sup.balance).toBe(8_000);

    await post('/finance/vouchers', { kind: 'CASH_PAYMENT', supplierId, amountPaisa: 3_000, memo: 'paid on account' }).expect(201);
    sup = (await get(`/finance/suppliers/${supplierId}/ledger`)).body;
    expect(sup.balance).toBe(5_000);
  });

  it('expense vouchers draw down cash; cash book totals reconcile', async () => {
    await post('/finance/vouchers', { kind: 'EXPENSE', amountPaisa: 500, memo: 'fuel', paidFrom: 'CASH' }).expect(201);

    const book = (await get('/finance/cash-book')).body;
    // delta this suite posted: cash +5_000 (receipt) - 3_000 (payment) - 500 (fuel); bank +2_500
    expect(book.cashBalance - bookBefore.cashBalance).toBe(5_000 - 3_000 - 500);
    expect(book.bankBalance - bookBefore.bankBalance).toBe(2_500);

    // customer running balance trail on the ledger lines
    const led = (await get(`/finance/customers/${customerId}/ledger`)).body;
    const runnings = led.lines.map((l: any) => l.running);
    expect(runnings).toEqual([12_500, 7_500, 5_000]);
  });

  it('Dr always equals Cr across every voucher posted so far', async () => {
    const vouchers = (await get('/finance/vouchers')).body;
    for (const v of vouchers) {
      const dr = v.lines.reduce((s: number, l: any) => s + l.debitPaisa, 0);
      const cr = v.lines.reduce((s: number, l: any) => s + l.creditPaisa, 0);
      expect(dr).toBe(cr);
    }
  });

  it('Golden Rule 3 for money: UPDATE/DELETE on vouchers and lines rejected by DB trigger', async () => {
    const v = await prisma.voucher.findFirst({ where: { memo: 'recovery at shop' } });
    await expect(prisma.voucher.update({ where: { id: v!.id }, data: { memo: 'fraud' } })).rejects.toThrow(/append-only/);
    const l = await prisma.journalLine.findFirst({ where: { voucherId: v!.id } });
    await expect(prisma.journalLine.delete({ where: { id: l!.id } })).rejects.toThrow(/append-only/);
  });

  it('booker can read customer ledger but cannot post vouchers', async () => {
    const bookerName = `bk${suffix}`;
    await post('/users', { username: bookerName, password: 'booker1234', fullName: 'B', role: 'BOOKER' }).expect(201);
    const bk = (await request(app.getHttpServer()).post('/auth/login').send({ username: bookerName, password: 'booker1234' })).body.accessToken;
    await request(app.getHttpServer()).get(`/finance/customers/${customerId}/ledger`).set('Authorization', `Bearer ${bk}`).expect(200);
    await request(app.getHttpServer())
      .post('/finance/vouchers')
      .set('Authorization', `Bearer ${bk}`)
      .send({ kind: 'CASH_RECEIPT', customerId, amountPaisa: 1 })
      .expect(403);
  });
});
