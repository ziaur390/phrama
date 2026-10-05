import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * M7 e2e — the full sales story on a real Postgres:
 * FEFO allocation, pricing layers + bonus FOC, M5 tax lines frozen per line,
 * fresh vs counter channels, PREPAID gate, void reversal, credit/debit notes.
 */
describe('Sales (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const suffix = Date.now().toString(36);
  let companyId: string, productId: string, gproductId: string, warehouseId: string, customerId: string, nonFilerId: string, prepaidId: string, defaulterId: string;

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

    // strict company + product Rs 100 (10_000 paisa)
    const company = await post('/companies', { code: `SL${suffix}`, name: 'Sales Co (STRICT)' });
    companyId = company.body.id;
    await post(`/companies/${companyId}/tax-policy`, { policy: 'STRICT', effectiveFrom: '2000-01-01' });
    const product = await post('/products', { code: `SP${suffix}`, name: 'Sellingmed', companyId, salePricePaisa: 10_000 });
    productId = product.body.id;

    // batches: b1 expires sooner (FEFO first), b2 later
    const b1 = await post('/batches', { productId, batchNo: `B1${suffix}`, expiry: '2026-06-30', costPricePaisa: 8_000 });
    const b2 = await post('/batches', { productId, batchNo: `B2${suffix}`, expiry: '2027-01-15', costPricePaisa: 8_000 });
    const warehouse = await prisma.warehouse.findFirst({ where: { kind: 'MAIN' } });
    warehouseId = warehouse!.id;
    await post('/inventory/opening', {
      warehouseId,
      lines: [
        { productId, batchId: b1.body.id, qty: 30 },
        { productId, batchId: b2.body.id, qty: 30 },
      ],
    });

    // absorbing company + product for mixed-invoice tax test
    const gcompany = await post('/companies', { code: `SA${suffix}`, name: 'Absorb Co' });
    gproductId = (await post('/products', { code: `SG${suffix}`, name: 'Absorbmed', companyId: gcompany.body.id, salePricePaisa: 10_000 })).body.id;
    await post(`/companies/${gcompany.body.id}/tax-policy`, { policy: 'ABSORB', effectiveFrom: '2000-01-01' });
    const gb1 = await post('/batches', { productId: gproductId, batchNo: `GB${suffix}`, expiry: '2027-06-30', costPricePaisa: 8_000 });
    await post('/inventory/opening', { warehouseId, lines: [{ productId: gproductId, batchId: gb1.body.id, qty: 50 }] });

    // customers
    customerId = (await post('/customers', { code: `CF${suffix}`, name: 'Filer Store', filerStatus: 'FILER' })).body.id;
    nonFilerId = (await post('/customers', { code: `CN${suffix}`, name: 'NonFiler Store', filerStatus: 'NON_FILER' })).body.id;
    prepaidId = (await post('/customers', { code: `CP${suffix}`, name: 'Prepaid Dealer', type: 'PREPAID', filerStatus: 'FILER' })).body.id;
    // prepaid with no payments at all (pure defaulter)
    defaulterId = (await post('/customers', { code: `CQ${suffix}`, name: 'Prepaid Defaulter', type: 'PREPAID', filerStatus: 'FILER' })).body.id;

    // pricing: product slab 10% from qty 10, bonus buy 10 get 1
    await post('/sales/discount-rules', { productId, minQty: 10, discountPct: 10 }).expect(201);
    await post('/sales/bonus-rules', { productId, buyQty: 10, freeQty: 1 }).expect(201);
  }, 40_000);

  afterAll(async () => { await app.close(); });

  let invoiceId: number;

  it('fresh sale of 12 to FILER store: FEFO (earlier expiry first), -10%, bonus +1, tax 0.5% charged', async () => {
    const stockBefore = (await get(`/inventory/stock?productId=${productId}&warehouseId=${warehouseId}`)).body;

    const res = await post('/sales/invoices', {
      customerId,
      warehouseId,
      items: [{ productId, qty: 12 }],
    }).expect(201);
    invoiceId = res.body.id;

    // 12 sale + 1 bonus = 13 pulled from b1 (earlier expiry has 30) -> b1 down 13
    const items = res.body.items;
    expect(items).toHaveLength(2);
    const regular = items.find((i: any) => !i.isBonus);
    const bonus = items.find((i: any) => i.isBonus);
    expect(regular.qty).toBe(12);
    expect(regular.unitPricePaisa).toBe(10_000);
    expect(regular.discountPct).toBe(10);
    expect(bonus.qty).toBe(1);
    expect(bonus.isBonus).toBe(true);
    expect(bonus.unitPricePaisa).toBe(0);

    // FEFO: both rows from the same earliest-expiry batch (b1, 2026-06-30, has 30)
    expect(bonus.batchId).toBe(regular.batchId);

    // stock decreased by 13 on the earliest batch
    const stockAfter = (await get(`/inventory/stock?productId=${productId}&warehouseId=${warehouseId}`)).body;
    const b1row = stockAfter.find((r: any) => r.batchId === regular.batchId);
    expect(stockBefore.find((r: any) => r.batchId === regular.batchId).qty - b1row.qty).toBe(13);

    // net: 12 x Rs 100 x 0.9 = Rs 1,080 -> tax 0.5% = Rs 5.40 -> paisa rounding half-up = 500? no: 540 paisa, not 500.
    // 1080 paisa-rupees: 1080 x 100 paisa = 108,000 paisa; 0.5% = 540 paisa = Rs 5.40
    expect(regular.taxChargedPaisa).toBe(540);
    // bonus line: zero tax
    expect(bonus.taxChargedPaisa).toBe(0);
  });

  it('journal posts: Dr AR 108,540 (net+tax) / Cr SALES — Dr=Cr', async () => {
    const vouchers = (await get('/finance/vouchers')).body;
    const v = vouchers.find((x: any) => x.memo?.includes(`INV-${String(invoiceId).padStart(6, '0')}`));
    expect(v).toBeTruthy();
    const dr = v.lines.reduce((s: number, l: any) => s + l.debitPaisa, 0);
    const cr = v.lines.reduce((s: number, l: any) => s + l.creditPaisa, 0);
    expect(dr).toBe(cr);
    const led = (await get(`/finance/customers/${customerId}/ledger`)).body;
    expect(led.balance).toBe(108_000 + 540); // net Rs 1,080 + tax Rs 5.40
  });

  it('non-filer store pays 2.5% — the same basket costs more', async () => {
    const res = await post('/sales/invoices', {
      customerId: nonFilerId,
      warehouseId,
      items: [{ productId, qty: 2 }],
    }).expect(201);
    const regular = res.body.items.find((i: any) => !i.isBonus);
    // no slab (qty 2 < 10): 2 x 100 = Rs 200 net; tax 2.5% = Rs 5
    expect(regular.taxChargedPaisa).toBe(500);
  });

  it('mixed invoice: strict company charges the store, absorbing company tracks for reimbursement', async () => {
    const ledBefore = (await get(`/finance/customers/${customerId}/ledger`)).body;
    const res = await post('/sales/invoices', {
      customerId,
      warehouseId,
      items: [
        { productId, qty: 1 },      // strict: charged
        { productId: gproductId, qty: 1 }, // absorbing: absorbed
      ],
    }).expect(201);
    const strictLine = res.body.items.find((i: any) => i.productId === productId);
    const absorbLine = res.body.items.find((i: any) => i.productId === gproductId);
    expect(strictLine.taxChargedPaisa).toBe(50); // 0.5% of Rs 100
    expect(absorbLine.taxAbsorbedPaisa).toBe(50);
    expect(absorbLine.taxChargedPaisa).toBe(0);

    // store pays 200 + 0.50 (strict tax); claim receivable 0.50 (absorbed)
    const vouchers = (await get('/finance/vouchers')).body;
    const v = vouchers.find((x: any) => x.memo?.includes(`INV-${String(res.body.id).padStart(6, '0')}`));
    const claim = v.lines.filter((l: any) => l.account === 'TAX_ABSORBED').reduce((s: number, l: any) => s + l.debitPaisa, 0);
    expect(claim).toBe(50);
    const arBefore = ledBefore.balance; // captured at test start below
    const arAfter = (await get(`/finance/customers/${customerId}/ledger`)).body.balance;
    // strict line: net Rs 100 + tax Rs 0.50 -> AR +10,050; absorbing line: net Rs 100 -> AR +10,000
    expect(arAfter - arBefore).toBe(20_050);
  });

  it('counter sale posts cash, not receivable', async () => {
    const before = (await get(`/finance/cash-book`)).body.cashBalance;
    const arBefore = (await get(`/finance/customers/${customerId}/ledger`)).body.balance;
    const res = await post('/sales/invoices', {
      customerId,
      warehouseId,
      channel: 'COUNTER',
      items: [{ productId: gproductId, qty: 3 }],
    }).expect(201);
    const after = (await get(`/finance/cash-book`)).body.cashBalance;
    // absorbing company: store pays net 300 only
    expect(after - before).toBe(30_000);
    const arAfter = (await get(`/finance/customers/${customerId}/ledger`)).body.balance;
    expect(arAfter).toBe(arBefore); // counter sale never touches receivable
  });

  it('PREPAID dealer without payments cannot buy; after paying, can', async () => {
    const res = await post('/sales/invoices', {
      customerId: defaulterId,
      warehouseId,
      items: [{ productId: gproductId, qty: 1 }],
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/PREPAID/);

    // pay Rs 500 in advance
    await post('/finance/vouchers', { kind: 'JOURNAL', lines: [
      { account: 'AR', creditPaisa: 50_000, customerId: defaulterId },
      { account: 'CASH', debitPaisa: 50_000 },
    ] }).expect(201);

    await post('/sales/invoices', { customerId: defaulterId, warehouseId, items: [{ productId: gproductId, qty: 1 }] }).expect(201);
  });

  it('void: stock restored, receivable reversed, invoice marked VOID', async () => {
    const stockBefore = (await get(`/inventory/stock?productId=${productId}&warehouseId=${warehouseId}`)).body;
    const ledBefore = (await get(`/finance/customers/${customerId}/ledger`)).body.balance;

    const res = await post(`/sales/invoices/${invoiceId}/void`, { reason: 'wrong products booked' }).expect(201);
    expect(res.body.status).toBe('VOID');
    expect(res.body.voidReason).toBe('wrong products booked');

    const stockAfter = (await get(`/inventory/stock?productId=${productId}&warehouseId=${warehouseId}`)).body;
    expect(stockAfter.find((r: any) => r.batchId === stockBefore.find((s: any) => true).batchId).qty)
      .toBe(stockBefore.find((s: any) => true).qty + 13);

    const vouchers = (await get('/finance/vouchers')).body;
    const v = vouchers.find((x: any) => x.memo?.includes(`VOID of sales invoice INV-${String(invoiceId).padStart(6, '0')}`));
    expect(v).toBeTruthy();
    const dr = v.lines.reduce((s: number, l: any) => s + l.debitPaisa, 0);
    const cr = v.lines.reduce((s: number, l: any) => s + l.creditPaisa, 0);
    expect(dr).toBe(cr);

    const ledAfter = (await get(`/finance/customers/${customerId}/ledger`)).body.balance;
    // the void reversed exactly the first invoice's AR line: net 108,000 + tax 540
    expect(ledAfter).toBe(ledBefore - 108_540);
  });

  it('credit note reduces balance, debit note increases it', async () => {
    const before = (await get(`/finance/customers/${customerId}/ledger`)).body.balance;
    await post('/sales/credit-notes', { customerId, amountPaisa: 10_000, memo: 'price dispute - CN' }).expect(201);
    const afterCn = (await get(`/finance/customers/${customerId}/ledger`)).body.balance;
    expect(afterCn).toBe(before - 10_000);
    await post('/sales/debit-notes', { customerId, amountPaisa: 4_000, memo: 'undercharge correction - DN' }).expect(201);
    const afterDn = (await get(`/finance/customers/${customerId}/ledger`)).body.balance;
    expect(afterDn).toBe(afterCn + 4_000);
  });

  it('invoice items are append-only (DB trigger)', async () => {
    const item = await prisma.salesInvoiceItem.findFirst({ where: { productId } });
    await expect(prisma.salesInvoiceItem.update({ where: { id: item!.id }, data: { qty: 999 } })).rejects.toThrow(/append-only/);
    await expect(prisma.salesInvoiceItem.delete({ where: { id: item!.id } })).rejects.toThrow(/append-only/);
  });

  it('insufficient stock is rejected with the shortfall', async () => {
    const res = await post('/sales/invoices', {
      customerId,
      warehouseId,
      items: [{ productId: gproductId, qty: 999_999 }],
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/Insufficient stock/);
  });
});
