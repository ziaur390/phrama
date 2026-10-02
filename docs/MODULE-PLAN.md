# PHRAMA — Module Build Plan
Small modules, each built → tested → done, in order. One module at a time. Nothing speculative.

**Stack (locked):** npm workspaces monorepo · NestJS + Prisma + PostgreSQL · React + Vite + TanStack Query + shadcn/ui · Docker Compose. Flutter mobile comes later (Module 10).

**Two hard rules every module obeys:**
1. `stock_movements` append-only; stock is computed, never a bare qty.
2. Financial documents are immutable once posted → corrections are Void / Credit Note / Debit Note documents.

Money = `NUMERIC` / integer paisa. Never float.

---

## M0 — Skeleton (repo runs on a clean machine) → small steps
1. `npm workspaces` monorepo: `apps/api` (NestJS), `apps/web` (Vite React), `packages/shared` (DTOs/types).
2. `docker-compose.yml`: postgres + redis (+ api + web later).
3. Prisma connected, first migration, `/health` endpoint.
4. GitHub Actions: lint + test on every push. `.env.example`, no secrets.

**Done when:** `docker compose up` → health check green from a clean clone.

## M1 — Auth & Users (everything needs it)
- Users, roles (admin/accountant/warehouse/booker/salesman/counter), JWT login, route guards, audit-log table.
- **Test:** role tries an admin-only endpoint → 403; admin → 200.

**Done when:** login + RBAC guard proven by test.

## M2 — Catalog / Master Data (nothing works without it)
1. `companies` — incl. **tax policy history** (ABSORB/STRICT + effective dates).
2. `products` — code (keep old IDs), pack, sale price, JSONB attributes; `batches` definition (batch no, mfg/expiry, cost).
3. `customers` — type REGULAR / SALESMAN / PREPAID, `filer_status` (FILER/NON-FILER), credit limit, opening balance.
4. `suppliers`, `territories` → `salesmen` → customer assignments, `warehouses` (warehouse + vans as locations).
5. Excel import for all masters.

**Test:** CRUD + import; customer PREPAID/filer flags enforced on write.

**Done when:** masters exist and import loads the old data.

## M3 — Inventory Core (the stock ledger)
1. `stock_movements` **append-only** table (moves: OPENING, IN, OUT, TRANSFER_OUT/IN, ADJUSTMENT, QUARANTINE). No delete/update — enforced.
2. Opening Stock Entry as a document → first movements.
3. Current stock = computed query per product/batch/warehouse.
4. Transfers (Main → Van), Stock Adjustment document (mandatory reason), quarantine pool.

**Test:** receipt-then-sale math, "480 vs 500" adjustment explains history line-by-line.

**Done when:** opening + transfers + adjustments leave a provable history.

## M4 — Ledger (money core)
1. Double-entry `journal_entries` (every line Dr=Cr), `vouchers` (cash/bank receipt & payment, journal, expense).
2. Customer & supplier sub-ledgers computed from journals; cash book.
3. Every money document posts its journal inside one transaction.

**Test:** opening balances via journal; receipt → customer balance ↓ + cash ↑, and Dr=Cr always.

**Done when:** a ledger says "why is this balance what it is" by tracing entries.

## M5 — Tax Engine (the heart — build before any sales)
- Inputs: company policy on invoice date (ABSORB/STRICT) × customer `filer_status` × date-effective rate table (FILER 0.5% / NON-FILER 2.5% — later FBR confirmation).
- Output per line: `tax_charged` (store pays) and `tax_absorbed` (tracked for company statement).
- Policy/rate changes are new dated rows; old invoices keep the values they were posted with.

**Test (highest value test in the repo):** the two documented examples — mixed GSK(STRICT)+Abbott(ABSORB) invoice, filer 200.50 & non-filer 202.50 — both must pass exactly.

**Done when:** FR-4 examples pass as unit tests.

## M6 — Procurement (PO → Receipt → Payable)
1. PO header/items → `Stock Receipt` linked to PO with actual qty + batch + expiry; partial receipts → PO status PENDING/PARTIAL/RECEIVED.
2. One transaction on receipt POST: stock movements IN · supplier payable ↑ · journal (Inventory Dr / Payable Cr).

**Test:** 1,000 ordered → 980 received → PARTIAL, stock+payable+journal all consistent, FEFO position from expiry.

**Done when:** goods in = stock + money together, atomically.

## M7 — Sales Engine (fresh + counter sales)
1. Pricing layers in order: base → company scheme → customer terms → qty slab → **bonus** (buy 10 get 1 = FOC line, zero revenue).
2. FEFO batch allocator (earliest expiry first) → frozen batch allocation on the invoice.
3. Fresh Sales post (one transaction): invoice+items immutable · stock OUT per batch · receivable ↑ (or cash for counter) · journal (+M5 tax lines) · events.
4. Counter sales channel: cash captured at counter.
5. Corrections: **Void** (reason+permission, full reversal), Credit Note, Debit Note — never an edit. PREPAID customer: order blocked until payments cover order value.

**Test:** full post, void-reversal returns stock+balance exactly, PREPAID block fires, FEFO picks correct batch order.

**Done when:** the Phase-1 core sells and corrects safely.

## M8 — Returns, Expiry & Claims-lite
1. Sales Return linked to invoice; disposition SALEABLE (stock in) / DAMAGED / EXPIRED (quarantine).
2. Weekly expiry report 30/60/90/180 days.
3. Return-to-company → claim record (per company, status OPEN → SENT → PAID) + absorbed-tax company statement (product-wise, split by filer status — feeds FR-4 reimbursement).
4. Unclaimed expired → Stock Adjustment (EXPIRED WRITE-OFF) → loss recognized.

**Test:** return → quarantine is not sellable; claim lifecycle moves money only when paid.

**Done when:** expiring money gets recovered instead of rotted. *(Blocked parts of claims remain until PRS is confirmed.)*

## M9 — Reports & Owner Dashboard
- Stock + batch, expiry buckets, DSR per booker, customer/supplier statements, cash book, company-wise tax statement, KPI dashboard (live sales, receivables, cash, recoveries).

**Test:** each report reconciles against the ledger it came from.

**Done when:** owner sees live truth; reports need zero retyping.

## M10 — Field Sync + Booker App (Phase 3)
- `sync/` endpoints (order + recovery upload, conflict rules), weekly area calendar (order day/delivery day), offline-first Flutter app, salesman channel routing (`via: SALESMAN_X` vs `DIRECT` — billed to salesman, never his stores).

**Done when:** an order taken with no internet lands in the warehouse queue.

---

## Later / deferred (not in this plan until asked)
Full payroll (journal entries only), multi-company/currency, BI dashboards, customer portal, credit auto-shield (v1 shows balance to bookers only), Go services.

## Answered questions baked in (do not re-open)
- No credit blocking in v1 — balances visible to bookers; only PREPAID orders are gated.
- Bonus stock is free from company → FOC lines, zero cost/zero tax.
- FILER 0.5% / NON-FILER 2.5% by store status; strict companies charge store, absorbing companies get company statements.
- Salesmen: billed to HIM, distribution collects from him, his margin is his own, he never holds stock.
- Recovery: cash AND bank, recorded per collection.

## Still open (blocking order)
- PRS exact flow (M8 claims detail) — ask owner.
- Short-return resolution (re-delivery vs credit note vs claim) — ask owner.
- FBR e-invoicing requirements (M5 invoice numbering) — ask owner.

## Working rhythm
1 module = 1 branch → small steps → tests green → PR → merge → next. Never start the next module with this one red.
