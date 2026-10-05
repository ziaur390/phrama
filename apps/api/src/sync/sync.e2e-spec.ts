import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * M10 e2e — field sync on a real Postgres:
 * pull gives catalog + shop balances; offline orders/recoveries are idempotent
 * (phone retries blindly); salesman routing bills HIM; PREPAID gate fires at invoicing;
 * warehouse queue receives -> invoices.
 */
describe('Field Sync (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const suffix = Date.now().toString(36);
  let companyId: string, productId: string, warehouseId: string, shopId: string, salesmanId: string, prepaidId: string;

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

    companyId = (await post('/companies', { code: `SY${suffix}`, name: 'Sync Co' })).body.id;
    await post(`/companies/${companyId}/tax-policy`, { policy: 'STRICT', effectiveFrom: '2000-01-01' });
    productId = (await post('/products', { code: `SY${suffix}`, name: 'Syncmed', companyId, salePricePaisa: 10_000 })).body.id;
    const batchId = (await post('/batches', { productId, batchNo: `SB${suffix}`, expiry: '2027-03-01', costPricePaisa: 8_000 })).body.id;
    warehouseId = (await prisma.warehouse.findFirst({ where: { kind: 'MAIN' } }))!.id;
    await post('/inventory/opening', { warehouseId, lines: [{ productId, batchId, qty: 200 }] });

    shopId = (await post('/customers', { code: `SYshop${suffix}`, name: 'Sync Shop', filerStatus: 'FILER' })).body.id;
    salesmanId = (await post('/customers', { code: `SYsales${suffix}`, name: 'Sync Salesman', type: 'SALESMAN', filerStatus: 'FILER' })).body.id;
    prepaidId = (await post('/customers', { code: `SYpre${suffix}`, name: 'Sync Prepaid', type: 'PREPAID', filerStatus: 'FILER' })).body.id;
  }, 40_000);

  afterAll(async () => { await app.close(); });

  it('pull: catalog has stock + price, shops carry live balances', async () => {
    const res = (await get('/sync/pull')).body;
    const cat = res.catalog.find((c: any) => c.id === productId);
    expect(cat.stockInMain).toBe(200);
    expect(cat.salePricePaisa).toBe(10_000);
    const shop = res.customers.find((c: any) => c.id === shopId);
    expect(shop.balancePaisa).toBe(0);
  });

  it('offline order upload is idempotent: same clientRef twice = one order', async () => {
    const body = { clientRef: `ref${suffix}1`, customerId: shopId, items: [{ productId, qty: 10 }] };
    const first = await post('/sync/orders', body).expect(201);
    const second = await post('/sync/orders', body).expect(201);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.id).toBe(first.body.id);
    expect(await prisma.bookerOrder.count({ where: { clientRef: body.clientRef } })).toBe(1);
  });

  it('recovery upload is idempotent and moves the cash book + customer balance', async () => {
    const body = { clientRef: `rec${suffix}`, customerId: shopId, amountPaisa: 5_000, mode: 'CASH' };
    const first = await post('/sync/recoveries', body).expect(201);
    const second = await post('/sync/recoveries', body).expect(201);
    expect(second.body.duplicate).toBe(true);

    const shopLed = (await get(`/finance/customers/${shopId}/ledger`)).body;
    expect(shopLed.balance).toBe(-5_000); // paid ahead, no invoice yet
  });

  it('warehouse invoices the order -> stock out, receivable on the shop', async () => {
    const orders = (await get('/sync/orders?status=RECEIVED')).body;
    const order = orders.find((o: any) => o.clientRef === `ref${suffix}1`);
    expect(order).toBeTruthy();

    const shopLedBefore = (await get(`/finance/customers/${shopId}/ledger`)).body.balance;

    const res = await post(`/sync/orders/${order.id}/invoice`).expect(201);
    expect(res.body.status).toBe('INVOICED');
    expect(res.body.invoice.customerId).toBe(shopId);

    const stock = (await get(`/inventory/stock?productId=${productId}&warehouseId=${warehouseId}`)).body;
    expect(stock[0].qty).toBe(190); // 200 - 10

    const shopLedAfter = (await get(`/finance/customers/${shopId}/ledger`)).body.balance;
    // 10 x Rs 100 = 1,000 + 0.5% tax 5 => +100,500 paisa; balance: -5_000 + 100_500 = 95_500
    expect(shopLedAfter - shopLedBefore).toBe(100_500);
    expect(shopLedAfter).toBe(95_500);

    // invoicing again is rejected
    await post(`/sync/orders/${order.id}/invoice`).expect(409);
  });

  it('order "on behalf of" salesman -> invoice billed to HIM, never his store', async () => {
    const res = await post('/sync/orders', {
      clientRef: `ref${suffix}via`,
      customerId: shopId,
      viaCustomerId: salesmanId,
      items: [{ productId, qty: 2 }],
    }).expect(201);

    const invoiced = await post(`/sync/orders/${res.body.id}/invoice`).expect(201);
    expect(invoiced.body.invoice.customerId).toBe(salesmanId); // billed to the salesman

    const salesLed = (await get(`/finance/customers/${salesmanId}/ledger`)).body.balance;
    expect(salesLed).toBe(20_100); // 2 x Rs 100 + 0.5% tax Rs 1
    const shopLed = (await get(`/finance/customers/${shopId}/ledger`)).body.balance;
    expect(shopLed).toBe(95_500); // untouched
  });

  it('PREPAID dealer without enough advance is blocked at invoicing, not at order time', async () => {
    const order = await post('/sync/orders', {
      clientRef: `ref${suffix}pre`,
      customerId: prepaidId,
      items: [{ productId, qty: 3 }],
    }).expect(201);

    const res = await post(`/sync/orders/${order.body.id}/invoice`);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/PREPAID/);

    // dealer pays ahead Rs 500
    await post('/finance/vouchers', { kind: 'JOURNAL', lines: [
      { account: 'AR', creditPaisa: 50_000, customerId: prepaidId },
      { account: 'CASH', debitPaisa: 50_000 },
    ] }).expect(201);

    await post(`/sync/orders/${order.body.id}/invoice`).expect(201);
  });

  it('viaCustomerId must be a SALESMAN customer', async () => {
    await post('/sync/orders', {
      clientRef: `ref${suffix}bad`,
      customerId: shopId,
      viaCustomerId: shopId, // a REGULAR shop is not a salesman
      items: [{ productId, qty: 1 }],
    }).expect(400);
  });
});
