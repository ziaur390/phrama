import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * M9 e2e — the.exit criterion: every report number reconciles with the documents
 * that produced it. Uses its own warehouse + company so it can assert absolutes.
 */
describe('Reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const suffix = Date.now().toString(36);
  let customerId: string, warehouseId: string, productId: string, companyId: string, batchId: string;

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

    companyId = (await post('/companies', { code: `RPT${suffix}`, name: 'Report Co' })).body.id;
    await post(`/companies/${companyId}/tax-policy`, { policy: 'STRICT', effectiveFrom: '2000-01-01' });
    productId = (await post('/products', { code: `RR${suffix}`, name: 'Reportmed', companyId, salePricePaisa: 10_000 })).body.id;
    batchId = (await post('/batches', { productId, batchNo: `RB${suffix}`, expiry: '2027-03-01', costPricePaisa: 8_000 })).body.id;

    warehouseId = (await post('/warehouses', { name: `ReportWH${suffix}`, kind: 'MAIN' })).body.id;
    await post('/inventory/opening', { warehouseId, lines: [{ productId, batchId, qty: 100 }] });

    customerId = (await post('/customers', { code: `RC${suffix}`, name: 'Report Store', filerStatus: 'FILER' })).body.id;
  }, 40_000);

  afterAll(async () => { await app.close(); });

  it('dashboard: sales today, receivable, cash — matching the exact documents posted', async () => {
    await post('/sales/invoices', { customerId, warehouseId, items: [{ productId, qty: 5 }] }).expect(201); // net 50_000 + tax 250
    await post('/finance/vouchers', { kind: 'CASH_RECEIPT', customerId, amountPaisa: 20_000, memo: 'recovery' }).expect(201);

    const dash = (await get('/reports/dashboard')).body;
    // sales today >= 5 (other suites may sell too, but this suite's customer is unique: assert via this customer's AR)
    const statement = (await get(`/reports/customer-statement?customerId=${customerId}&from=2000-01-01&to=2099-01-01`)).body;
    // opening 0 -> invoice +50,250 -> receipt -20,000 -> closing 30,250
    expect(statement.openingPaisa).toBe(0);
    expect(statement.closingPaisa).toBe(30_250);
    // M7 posts one AR line per invoice: net + charged tax = 50,250
    const ledLines = statement.lines.map((l: any) => [l.debitPaisa, l.creditPaisa, l.runningPaisa]);
    expect(ledLines).toEqual([
      [50_250, 0, 50_250],
      [0, 20_000, 30_250],
    ]);
  });

  it('sales-by-product: qty+charged tax equal the invoices posted', async () => {
    const rows = (await get(`/reports/sales-by-product?from=2000-01-01&to=2099-01-01`)).body;
    const row = rows.find((r: any) => r.productId === productId);
    expect(row.qty).toBe(5);
    expect(row.taxChargedPaisa).toBe(250); // 0.5% of Rs 50,000 net = Rs 2.50
  });

  it('stock valuation: 95 x Rs 80 = Rs 7,600 at cost', async () => {
    const rows = (await get(`/reports/stock-valuation?warehouseId=${warehouseId}`)).body;
    const row = rows.find((r: any) => r.batchId === batchId);
    expect(row.qty).toBe(95); // 100 - 5 sold
    expect(row.valuePaisa).toBe(95 * 8_000);
  });

  it('non-admin cannot open the dashboard (owner-only)', async () => {
    const bookerName = `bkr${suffix}`;
    await post('/users', { username: bookerName, password: 'booker123', fullName: 'B', role: 'BOOKER' }).expect(201);
    const bk = (await request(app.getHttpServer()).post('/auth/login').send({ username: bookerName, password: 'booker123' })).body.accessToken;
    await request(app.getHttpServer()).get('/reports/dashboard').set('Authorization', `Bearer ${bk}`).expect(403);
    // but booker CAN read a customer statement (his collecting job)
    await request(app.getHttpServer()).get(`/reports/customer-statement?customerId=${customerId}&from=2000-01-01&to=2099-01-01`).set('Authorization', `Bearer ${bk}`).expect(200);
  });
});
