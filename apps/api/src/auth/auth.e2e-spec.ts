import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';

/**
 * M0/M1 e2e — runs against real Postgres+Redis (compose/CI services).
 * Proves: health public, login issues token, guard blocks protected route without token,
 * token opens protected route, roles guard blocks non-admin.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    // admin user exists from seed (admin/phrama123)
    const res = await request(app.getHttpServer()).post('/auth/login').send({ username: 'admin', password: 'phrama123' });
    token = res.body.accessToken;
  });

  afterAll(async () => { await app.close(); });

  it('GET /health is public', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('login returns a token', () => {
    expect(token).toBeTruthy();
  });

  it('GET /users without token → 401', async () => {
    await request(app.getHttpServer()).get('/users').expect(401);
  });

  it('GET /users with admin token → 200 list containing admin', async () => {
    const res = await request(app.getHttpServer()).get('/users').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.map((u: any) => u.username)).toContain('admin');
  });

  it('POST /users creates booker (admin allowed)', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'booker1', password: 'booker123', fullName: 'Test Booker', role: 'BOOKER' })
      .expect(201);
    expect(res.body.role).toBe('BOOKER');
  });

  it('new booker cannot access admin-only POST /users → 403', async () => {
    const bookerToken = (
      await request(app.getHttpServer()).post('/auth/login').send({ username: 'booker1', password: 'booker123' })
    ).body.accessToken;
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${bookerToken}`)
      .send({ username: 'x', password: 'xxxxxx', fullName: 'X', role: 'ADMIN' })
      .expect(403);
  });
});
