import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * M8 e2e — returns + the expiry/claims cycle on a real Postgres:
 * fresh return -> sellable stock back; damaged -> quarantine; over-return guard;
 * expiry report; absorbed-tax statement + claim lifecycle to cash;
 * expiry claim to company; write-off with loss journal.
 */
describe('Returns, Expiry & Claims (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const suffix = Date.now().toString(36);
  let companyId: string, absorbCompanyId: string, productId: string, gproductId: string;
  let warehouseId: string, quarantineId: string, filerId: string, batchIdP: string, batchIdG: string;

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

    companyId = (await post('/companies', { code: `RT${suffix}`, name: 'Return Co (STRICT)' })).body.id;
    await post(`/companies/${companyId}/tax-policy`, { policy: 'STRICT', effectiveFrom: '2000-01-01' });
    productId = (await post('/products', { code: `RP${suffix}`, name: 'Returnmed', companyId, salePricePaisa: 10_000 })).body.id;

    absorbCompanyId = (await post('/companies', { code: `RA${suffix}`, name: 'Absorb Co' })).body.id;
    await post(`/companies/${absorbCompanyId}/tax-policy`, { policy: 'ABSORB', effectiveFrom: '2000-01-01' });
    gproductId = (await post('/products', { code: `RG${suffix}`, name: 'Absorbmed2', companyId: absorbCompanyId, salePricePaisa: 10_000 })).body.id;

    const b1 = await post('/batches', { productId, batchNo: `B1${suffix}`, expiry: '2026-05-30', costPricePaisa: 8_000 });
    batchIdP = b1.body.id;
    const gb = await post('/batches', { productId: gproductId, batchNo: `GB${suffix}`, expiry: '2027-02-28', costPricePaisa: 8_000 });
    batchIdG = gb.body.id;

    warehouseId = (await prisma.warehouse.findFirst({ where: { kind: 'MAIN' } }))!.id;
    quarantineId = (await prisma.warehouse.findFirst({ where: { kind: 'QUARANTINE' } }))!.id;
    filerId = (await post('/customers', { code: `RF${suffix}`, name: 'Return Filer Store', filerStatus: 'FILER' })).body.id;

    await post('/inventory/opening', {
      warehouseId,
      lines: [
        { productId, batchId: batchIdP, qty: 50 },
        { productId: gproductId, batchId: batchIdG, qty: 50 },
      ],
    });
  }, 40_000);

  afterAll(async () => { await app.close(); });

  let invoiceId: number, absorbInvoiceId: number, invItemId: number, invItemIdG: number;

  it('sell 10 to filer store (strict, no slab) then return 2 SALEABLE -> stock back, AR credited pro-rata', async () => {
    const inv = await post('/sales/invoices', { customerId: filerId, warehouseId, items: [{ productId, qty: 10 }] }).expect(201);
    invoiceId = inv.body.id;
    invItemId = inv.body.items[0].id;
    // net 10 x Rs 100 = 1000 -> tax 0.5% = Rs 5 -> AR 1,00500 paisa? net=100_000, tax=500 => 100_500

    const arBefore = (await get(`/finance/customers/${filerId}/ledger`)).body.balance;
    const res = await post('/sales/returns', {
      invoiceId,
      memo: '2 unopened boxes returned',
      items: [{ invoiceItemId: invItemId, qty: 2, disposition: 'SALEABLE' }],
    }).expect(201);

    // pro-rata: net 2 x Rs 100 = Rs 200; tax 500 x 2/10 = 100 paisa
    const v = (await get('/finance/vouchers')).body.find((x: any) => x.memo?.includes(`RTN-${res.body.number.split('-')[1]}`));
    expect(v).toBeTruthy();
    const dr = v.lines.reduce((s: number, l: any) => s + l.debitPaisa, 0);
    const cr = v.lines.reduce((s: number, l: any) => s + l.creditPaisa, 0);
    expect(dr).toBe(cr);

    const arAfter = (await get(`/finance/customers/${filerId}/ledger`)).body.balance;
    expect(arAfter).toBe(arBefore - 20_000 - 100);

    // stock: +2 back to MAIN, same batch
    const stock = (await get(`/inventory/stock?productId=${productId}&warehouseId=${warehouseId}`)).body;
    expect(stock.find((r: any) => r.batchId === batchIdP)?.qty).toBe(50 - 10 + 2);

    // over-return guard: 8 remain sold; returning 9 must fail
    await post('/sales/returns', { invoiceId, items: [{ invoiceItemId: invItemId, qty: 9, disposition: 'SALEABLE' }] }).expect(400);
  });

  it('damaged return goes to quarantine (never sellable) and credits the store', async () => {
    const qBefore = (await get(`/inventory/stock?productId=${productId}&warehouseId=${quarantineId}`)).body;
    expect(qBefore.length).toBe(0);

    const res = await post('/sales/returns', {
      invoiceId,
      memo: '2 damaged',
      items: [{ invoiceItemId: invItemId, qty: 2, disposition: 'DAMAGED' }],
    }).expect(201);

    const qAfter = (await get(`/inventory/stock?productId=${productId}&warehouseId=${quarantineId}`)).body;
    expect(qAfter.find((r: any) => r.batchId === batchIdP)?.qty).toBe(2);

    // quarantine stock cannot flow back to sellable (M3 wall still holds)
    await post('/inventory/transfers', {
      fromWarehouseId: quarantineId,
      toWarehouseId: warehouseId,
      lines: [{ productId, batchId: batchIdP, qty: 1 }],
    }).expect(403);
  });

  it('absorbing-company sale + return reduces ABSORBED claim pro-rata', async () => {
    const inv = await post('/sales/invoices', { customerId: filerId, warehouseId, items: [{ productId: gproductId, qty: 4 }] }).expect(201);
    absorbInvoiceId = inv.body.id;
    invItemIdG = inv.body.items[0].id;
    // 4 x Rs 100 = 400 net, absorbed 0.5%? NON? filer 0.5% -> absorbed 2,00 paisa = 200 paisa per line (4x100x0.005 = 2 Rs = 200)
    const statement = (await get(`/claims/statement?companyId=${absorbCompanyId}&from=2000-01-01&to=2099-01-01`)).body;
    const line = statement.lines.find((l: any) => l.productId === gproductId && l.filerStatus === 'FILER');
    expect(line.qty).toBe(4);
    expect(line.absorbedPaisa).toBe(200);

    // return 1 of 4 -> absorbed claim drops by 1/4 (50 paisa)
    await post('/sales/returns', {
      invoiceId: absorbInvoiceId,
      items: [{ invoiceItemId: invItemIdG, qty: 1, disposition: 'SALEABLE' }],
    }).expect(201);

    const statement2 = (await get(`/claims/statement?companyId=${absorbCompanyId}&from=2000-01-01&to=2099-01-01`)).body;
    const line2 = statement2.lines.find((l: any) => l.productId === gproductId && l.filerStatus === 'FILER');
    expect(line2.absorbedPaisa).toBe(150); // 200 - 50
  });

  it('expiry report lists batches due within the window with stock', async () => {
    const res = (await get('/inventory/expiry?days=720')).body;
    const rows = res.filter((r: any) => r.batchId === batchIdP);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].batchNo).toContain('B1');
  });

  it('absorbed-tax statement -> OPEN claim -> SENT -> PAID, money lands in cash', async () => {
    const statement = (await get(`/claims/statement?companyId=${absorbCompanyId}&from=2000-01-01&to=2099-01-01`)).body;
    expect(statement.totalAbsorbedPaisa).toBe(150);

    const cashBefore = (await get('/finance/cash-book')).body.cashBalance;

    const claim = await post('/claims/tax-absorbed', { companyId: absorbCompanyId, from: '2000-01-01', to: '2099-01-01', memo: 'Abbott Q' }).expect(201);
    expect(claim.body.status).toBe('OPEN');
    expect(claim.body.amountPaisa).toBe(150);

    await post(`/claims/${claim.body.id}/send`).expect(201);
    await post(`/claims/${claim.body.id}/receive`, { amountPaisa: 150, mode: 'CASH' }).expect(201);

    const cashAfter = (await get('/finance/cash-book')).body.cashBalance;
    expect(cashAfter - cashBefore).toBe(150);

    const list = (await get(`/claims?status=PAID&companyId=${absorbCompanyId}`)).body;
    expect(list.map((c: any) => c.id)).toContain(claim.body.id);

    // repaying a paid claim is rejected
    await post(`/claims/${claim.body.id}/receive`, { amountPaisa: 100, mode: 'CASH' }).expect(400);
  });

  it('expiry claim: quarantine boxes back to company -> claim asset -> paid', async () => {
    const claim = await post('/claims/expiry', { companyId, batchId: batchIdP, qty: 1 }).expect(201);
    expect(claim.body.kind).toBe('EXPIRY');
    // 1 x cost Rs 80 = 8,000 paisa
    expect(claim.body.amountPaisa).toBe(8_000);

    // quarantine stock decreased by 1
    const q = (await get(`/inventory/stock?productId=${productId}&warehouseId=${quarantineId}`)).body;
    expect(q.find((r: any) => r.batchId === batchIdP)?.qty).toBe(2 - 1);

    const exBefore = (await get('/finance/cash-book')).body.cashBalance;
    await post(`/claims/${claim.body.id}/send`).expect(201);
    await post(`/claims/${claim.body.id}/receive`, { amountPaisa: 8_000, mode: 'BANK' }).expect(201);

    const exAfter = (await get('/finance/cash-book')).body;
    expect(exAfter.bankBalance).toBeGreaterThan(0);
  });

  it('unclaimed expired stock: write-off with loss journal', async () => {
    const expBefore = (await get('/finance/cash-book')).body.cashBalance; // not affected

    const res = await post('/claims/write-off', {
      batchId: batchIdP,
      warehouseId: quarantineId,
      qty: 1,
      reason: 'expired, unclaimed',
    }).expect(201);
    expect(res.body.lossPaisa).toBe(8_000);

    const q = (await get(`/inventory/stock?productId=${productId}&warehouseId=${quarantineId}`)).body;
    expect(q.find((r: any) => r.batchId === batchIdP)?.qty ?? 0).toBe(0);

    // over-write-off blocked
    await post('/claims/write-off', { batchId: batchIdP, warehouseId: quarantineId, qty: 5, reason: 'x' }).expect(400);
  });

  it('Dr = Cr across every money voucher the suite posted', async () => {
    const vouchers = (await get('/finance/vouchers')).body;
    for (const v of vouchers) {
      const dr = v.lines.reduce((s: number, l: any) => s + l.debitPaisa, 0);
      const cr = v.lines.reduce((s: number, l: any) => s + l.creditPaisa, 0);
      expect(dr).toBe(cr);
    }
  });

  it('return items are append-only (DB trigger)', async () => {
    const item = await prisma.salesReturnItem.findFirst();
    await expect(prisma.salesReturnItem.update({ where: { id: item!.id }, data: { qty: 999 } })).rejects.toThrow(/append-only/);
  });
});
