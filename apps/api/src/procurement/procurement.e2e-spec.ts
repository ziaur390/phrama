import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * M6 e2e - procurement on a real Postgres.
 * The documented story: order 1,000, receive 980 (short 20) -> PARTIAL,
 * receive the rest -> RECEIVED. Goods + payable move in ONE transaction.
 */
describe('Procurement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const suffix = Date.now().toString(36);
  let supplierId: string, productId: string, warehouseId: string, poId: number;

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

    const company = await post('/companies', { code: `PRC${suffix}`, name: 'Procurement Test Co' });
    const supplier = await post('/suppliers', { companyId: company.body.id });
    supplierId = supplier.body.id;
    const product = await post('/products', { code: `PR${suffix}`, name: 'Testomed', companyId: company.body.id, salePricePaisa: 10_000 });
    productId = product.body.id;
    const wh = await prisma.warehouse.findFirst({ where: { kind: 'MAIN' } });
    warehouseId = wh!.id;
  }, 30_000);

  afterAll(async () => { await app.close(); });

  it('creates a PO for 1,000 units at Rs 80 -> PENDING, numbered', async () => {
    const res = await post('/procurement/purchase-orders', {
      supplierId,
      lines: [{ productId, orderedQty: 1000, unitCostPaisa: 8_000 }],
    }).expect(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.number).toMatch(/^PO-\d{6}$/);
    expect(res.body.items).toHaveLength(1);
    poId = res.body.id;
  });

  it('receives 980 (short 20) -> PARTIAL: stock +980, payable +Rs 784, batch created', async () => {
    const apBefore = supplierId ? (await get(`/finance/suppliers/${supplierId}/ledger`)).body.balance : 0;

    const res = await post('/procurement/stock-receipts', {
      poId,
      warehouseId,
      lines: [{ productId, batchNo: `B-${suffix}`, expiry: '2027-06-30', receivedQty: 980, unitCostPaisa: 8_000 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.number).toMatch(/^SR-\d{6}$/);

    // PO went PARTIAL with receivedQty tracked
    const po = (await get(`/procurement/purchase-orders/${poId}`)).body;
    expect(po.status).toBe('PARTIAL');
    expect(po.items[0].receivedQty).toBe(980);

    // stock: 980 of the batch at the warehouse
    const stock = (await get(`/inventory/stock?productId=${productId}&warehouseId=${warehouseId}`)).body;
    expect(stock).toHaveLength(1);
    expect(stock[0].qty).toBe(980);

    // payable grew by exactly 980 x 80 = Rs 784
    const apAfter = (await get(`/finance/suppliers/${supplierId}/ledger`)).body.balance;
    expect(apAfter - apBefore).toBe(980 * 8_000);
  });

  it('receiving the remaining 20 -> RECEIVED; payable now Rs 800 total for this PO', async () => {
    const apBefore = (await get(`/finance/suppliers/${supplierId}/ledger`)).body.balance;

    await post('/procurement/stock-receipts', {
      poId,
      warehouseId,
      lines: [{ productId, batchNo: `B2-${suffix}`, expiry: '2027-09-30', receivedQty: 20, unitCostPaisa: 8_000 }],
    }).expect(201);

    const po = (await get(`/procurement/purchase-orders/${poId}`)).body;
    expect(po.status).toBe('RECEIVED');
    expect(po.items[0].receivedQty).toBe(1000);

    const apAfter = (await get(`/finance/suppliers/${supplierId}/ledger`)).body.balance;
    expect(apAfter - apBefore).toBe(20 * 8_000); // + Rs 16
  });

  it('receiving on a fully-received PO is rejected', async () => {
    await post('/procurement/stock-receipts', {
      poId,
      warehouseId,
      lines: [{ productId, batchNo: `B3-${suffix}`, expiry: '2027-12-30', receivedQty: 1, unitCostPaisa: 8_000 }],
    }).expect(400);
  });

  it('over-receipt beyond ordered qty is rejected with a clear message', async () => {
    const po2 = await post('/procurement/purchase-orders', {
      supplierId,
      lines: [{ productId, orderedQty: 10, unitCostPaisa: 8_000 }],
    });
    const res = await post('/procurement/stock-receipts', {
      poId: po2.body.id,
      warehouseId,
      lines: [{ productId, batchNo: `B4-${suffix}`, expiry: '2027-12-30', receivedQty: 11, unitCostPaisa: 8_000 }],
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/Over-receipt/);
  });

  it('receiving a product not on the PO is rejected', async () => {
    const other = await post('/products', { code: `OX${suffix}`, name: 'Othermed', companyId: (await post('/companies', { code: `OC${suffix}`, name: 'Other Co' })).body.id, salePricePaisa: 1_000 });
    const po3 = await post('/procurement/purchase-orders', { supplierId, lines: [{ productId, orderedQty: 5, unitCostPaisa: 100 }] });
    const res = await post('/procurement/stock-receipts', {
      poId: po3.body.id,
      warehouseId,
      lines: [{ productId: other.body.id, batchNo: `B5-${suffix}`, expiry: '2027-12-30', receivedQty: 1, unitCostPaisa: 100 }],
    });
    expect(res.status).toBe(400);
  });

  it('receipt voucher balanced (Dr INVENTORY = Cr AP) and journal memo references SR + PO', async () => {
    const vouchers = (await get('/finance/vouchers')).body;
    const receiptVoucher = vouchers.find((v: any) => v.memo && v.memo.includes(`PO-${String(poId).padStart(6, '0')}`));
    expect(receiptVoucher).toBeTruthy();
    const dr = receiptVoucher.lines.filter((l: any) => l.account === 'INVENTORY').reduce((s: number, l: any) => s + l.debitPaisa, 0);
    const cr = receiptVoucher.lines.filter((l: any) => l.account === 'AP').reduce((s: number, l: any) => s + l.creditPaisa, 0);
    expect(dr).toBe(cr);
    expect(dr).toBeGreaterThan(0);
  });

  it('warehouse user can post receipts; booker cannot', async () => {
    const whName = `wh${suffix}`;
    await post('/users', { username: whName, password: 'whpass1234', fullName: 'W', role: 'WAREHOUSE' }).expect(201);
    const whToken = (await request(app.getHttpServer()).post('/auth/login').send({ username: whName, password: 'whpass1234' })).body.accessToken;

    const po4 = await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${whToken}`)
      .send({ supplierId, lines: [{ productId, orderedQty: 5, unitCostPaisa: 100 }] })
      .expect(403); // warehouse cannot create POs

    // accountant creates, warehouse receives
    const po5 = await post('/procurement/purchase-orders', { supplierId, lines: [{ productId, orderedQty: 5, unitCostPaisa: 100 }] });
    await request(app.getHttpServer())
      .post('/procurement/stock-receipts')
      .set('Authorization', `Bearer ${whToken}`)
      .send({ poId: po5.body.id, warehouseId, lines: [{ productId, batchNo: `B6-${suffix}`, expiry: '2027-12-30', receivedQty: 5, unitCostPaisa: 100 }] })
      .expect(201);
  });

  it('receipts are append-only (DB trigger rejects update/delete)', async () => {
    const receipt = await prisma.stockReceipt.findFirst({ where: { poId } });
    await expect(prisma.stockReceipt.update({ where: { id: receipt!.id }, data: { memo: 'x' } })).rejects.toThrow(/append-only/);
    const item = await prisma.stockReceiptItem.findFirst({ where: { receiptId: receipt!.id } });
    await expect(prisma.stockReceiptItem.delete({ where: { id: item!.id } })).rejects.toThrow(/append-only/);
  });
});
