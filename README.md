# PHRAMA — Pharmaceutical Distribution Management System

Medicine distributor ERP for Malakand Division (KPK, Pakistan). Replaces one desktop
ERP + paper order pads with a cloud, multi-user system. Read `docs/THE-BIG-PICTURE.md`
first — the whole business in one story. Build order lives in `docs/MODULE-PLAN.md`.

## Layout

- `apps/api` — NestJS + Prisma + PostgreSQL API (port 4000)
- `apps/web` — React + Vite + TanStack Query web app (port 5173)
- `packages/shared` — shared types/DTOs (created when first DTO is shared)
- `docs/` — business docs: blueprint, module plan, team guide

## Quickstart (dev)

```bash
npm install
docker compose up -d --wait db redis
cp .env.example apps/api/.env        # Windows: copy .env.example apps\api\.env
npm run db:dev                       # apply migrations
npm run db:seed                      # seed admin/phrama123 + warehouses + tax rates
npm run dev:api                      # http://localhost:4000/health
npm run dev:web                      # http://localhost:5173
```

`apps/api/.env` is git-ignored — never commit real secrets.

## Test

```bash
npm run build   # tsc + vite, all workspaces
npm test        # unit + e2e (needs db+redis up: docker compose up -d --wait db redis)
```

CI (`.github/workflows/ci.yml`) runs the same: build → migrate deploy → tests, with
postgres+redis service containers.

## Compose (whole stack)

```bash
docker compose up -d --wait   # db + redis + api (migrates on boot)
curl http://localhost:4000/health
```

## Logins (seeded)

| user | password | role |
|---|---|---|
| admin | phrama123 | ADMIN |

Change immediately on any real deployment.
