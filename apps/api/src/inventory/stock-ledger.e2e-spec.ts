import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * M3 e2e — stock ledger on a real Postgres.
 * Proves the Golden Rules: append-only ledger, computed stock, quarantine walls,
 * and the "480 vs 500" story (opening + transfers + adjustment explain the number).
 */
describe('StockLedger (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const suffix = Date.now().toString(36);
  let companyId: string, productId: string, batchId: string, mainWid: string, vanWid: string, qWid: string;

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

    // fixtures
    const company = await post('/companies', { code: `TST${suffix}`, name: 'Test Pharma' });
    companyId = company.body.id;
    const product = await post('/products', { code: `P${suffix}`, name: 'Panadol', companyId, salePricePaisa: 10_000 });
    productId = product.body.id;
    const batch = await post('/batches', { productId, batchNo: `B1${suffix}`, expiry: '2027-06-01', costPricePaisa: 8_000 });
    batchId = batch.body.id;
    const main = await post('/warehouses', { name: `TestMain${suffix}`, kind: 'MAIN' });
    mainWid = main.body.id;
    const van = await post('/warehouses', { name: `TestVan${suffix}`, kind: 'VAN' });
    vanWid = van.body.id;
    const q = await post('/warehouses', { name: `TestQ${suffix}`, kind: 'QUARANTINE' });
    qWid = q.body.id;
  }, 30_000);

  afterAll(async () => { await app.close(); });

  async function qty(warehouseId: string) {
    const res = await get(`/inventory/stock?productId=${productId}&warehouseId=${warehouseId}`);
    return res.body.find((r: any) => r.warehouseId === warehouseId)?.qty ?? 0;
  }

  it('opening entry posts movements and stock is computed, not stored', async () => {
    const res = await post('/inventory/opening', {
      warehouseId: mainWid,
      lines: [{ productId, batchId, qty: 500 }],
    }).expect(201);
    expect(res.body.kind).toBe('OPENING');
    expect(res.body.movements).toHaveLength(1);
    expect(await qty(mainWid)).toBe(500);
  });

  it('transfer moves stock Main → Van atomically', async () => {
    await post('/inventory/transfers', {
      fromWarehouseId: mainWid,
      toWarehouseId: vanWid,
      lines: [{ productId, batchId, qty: 20 }],
    }).expect(201);
    expect(await qty(mainWid)).toBe(480);
    expect(await qty(vanWid)).toBe(20);
  });

  it('adjustment with mandatory reason documents the 480-vs-500 story', async () => {
    await post('/inventory/adjustments', { warehouseId: mainWid, reason: '', lines: [{ productId, batchId, delta: -3 }] }).expect(400);
    await post('/inventory/adjustments', {
      warehouseId: mainWid,
      reason: 'cycle count correction: physical 477 vs system 480',
      lines: [{ productId, batchId, delta: -3 }],
    }).expect(201);
    expect(await qty(mainWid)).toBe(477);

    // history proves every step
    const hist = await get(`/inventory/movements?productId=${productId}&warehouseId=${mainWid}`);
    const deltas = hist.body.map((m: any) => m.delta);
    expect(deltas).toEqual([500, -20, -3]);
  });

  it('overdraw is rejected at transfer and adjustment', async () => {
    await post('/inventory/transfers', {
      fromWarehouseId: mainWid,
      toWarehouseId: vanWid,
      lines: [{ productId, batchId, qty: 99999 }],
    }).expect(400);
    await post('/inventory/adjustments', {
      warehouseId: mainWid,
      reason: 'overdraw attempt',
      lines: [{ productId, batchId, delta: -99999 }],
    }).expect(400);
  });

  it('quarantine wall: quarantine stock cannot leak into sellable stock', async () => {
    await post('/inventory/transfers', { fromWarehouseId: mainWid, toWarehouseId: qWid, lines: [{ productId, batchId, qty: 10 }] }).expect(201);
    expect(await qty(qWid)).toBe(10);
    // and back out is blocked (quarantine → selling stock = forbidden)
    await post('/inventory/transfers', { fromWarehouseId: qWid, toWarehouseId: mainWid, lines: [{ productId, batchId, qty: 5 }] }).expect(403);
  });

  it('Golden Rule 3: DB trigger rejects UPDATE and DELETE on stock movements', async () => {
    const m = await prisma.stockMovement.findFirst({ where: { productId } });
    await expect(prisma.stockMovement.update({ where: { id: m!.id }, data: { delta: 999 } })).rejects.toThrow(/append-only/);
    await expect(prisma.stockMovement.delete({ where: { id: m!.id } })).rejects.toThrow(/append-only/);
  });

  it('batch ownership is validated (batch of another product rejected)', async () => {
    const product2 = await post('/products', { code: `P2${suffix}`, name: 'Brufen', companyId, salePricePaisa: 5_000 });
    const res = await post('/inventory/transfers', {
      fromWarehouseId: mainWid,
      toWarehouseId: vanWid,
      lines: [{ productId: product2.body.id, batchId, qty: 1 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not belong/);
  });
});
