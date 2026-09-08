# PHRAMA — Phase 0 Plan
## Foundations & Discovery (Weeks 1–2, Team of 3)

> **Phase 0 is NOT coding features.** It is the two weeks that make every later
> phase fast and safe. When Phase 0 ends, we know the business truth, the repo
> exists, the skeleton runs, and Phase 1 (Warehouse + Sales core) can start
> with zero blockers.

---

## 0.1 Goals of Phase 0

1. **Business truth collected** — every ❓ answered by the owner, sample data in hand
2. **Old system understood** — its data extracted and readable
3. **Skeleton running** — repo, backend skeleton, database, deploy pipeline live
4. **Schema designed** — the database that everything else grows from
5. **Roles agreed** — each of the 3 people owns a clear lane

---

## 0.2 Team Split (3 lanes, parallel work)

| Person | Lane | Owns |
|---|---|---|
| **You (PM/Lead)** | Business + Architecture | Owner meetings, decisions, schema sign-off, this documentation |
| **Dev A** | Backend skeleton | NestJS scaffold, Docker, DB, CI/CD, auth module |
| **Dev B** | Data + Backend modules | Old-system data extraction, import tooling, catalog + inventory schema |
| **Dev C** | Frontend foundations | React app shell, shadcn/ui setup, wireframes for Phase 1 screens |

Every lane has a **definition of done** below. Daily 15-min standup, one
question rule: *if blocked >2 hours, ask immediately.*

---

## 0.3 Week 1 — Business Discovery + Skeletons

### A. Owner Discovery Meeting (you + the owner, bring the checklist)

Print `MASTER-BLUEPRINT.md` Part 5. Get answers to:

- [ ] **PRS** — exact meaning and full paper flow (who claims whom, documents, timelines)
- [ ] **SPO** — role definition, do they affect orders?
- [ ] **Short returns** — free re-delivery / credit note / company claim?
- [ ] **Credit notes** — who approves, value thresholds?
- [ ] **Credit limits** — hard block or override-with-reason? Counter vs field difference?
- [ ] **Bonus stock** — free from company, or we pay for it?
- [ ] **FBR/fiscal invoice rules** for our region (numbering, format)
- [ ] **Warehouses/vans/branches** — how many exist today?
- [ ] **Scheme letters** — physical/PDF samples from top 3 companies
- [ ] Old system: **who has admin access**, can we export data?

**Also collect (ask, don't assume):**
- [ ] 10–20 real old invoices (photos/exports) — fresh sales, counter sales, returns, credit notes
- [ ] One full month of transactions export (any format: Excel, backup file, printouts)
- [ ] Current price lists + company discount structures
- [ ] Customer list with credit limits as used today
- [ ] One real DSR + one stock/expiry report

> 📸 **Photograph every screen of the old system you can.** These become
> acceptance criteria later — "ours must show what theirs shows, but faster."

### B. Dev A — Backend Skeleton (definition of done: "compose up works on a clean machine")

- [ ] Monorepo created (`apps/api`, `apps/web`, `apps/mobile`, `libs/shared`, `docs`)
- [ ] NestJS app scaffolded with module folders per blueprint 1.2
- [ ] Docker Compose: `api` + `postgres` + `redis` + `nginx` running locally
- [ ] TypeORM/Prisma (pick one, document why) connected to Postgres; migrations working
- [ ] BullMQ queue connected; one test job publishes and consumes an event
- [ ] Git + GitHub repo, branch protection, PR template
- [ ] GitHub Actions: lint + test + build on every PR (deploy job can wait)
- [ ] `.env.example` committed — no secrets in git, ever

### C. Dev B — Old System Data Autopsy (definition of done: "we can read their data")

- [ ] Get access to the old system's database/backup or export everything to Excel
- [ ] Map every table/screen to our module list (a simple spreadsheet is fine):
      old entity → new module → keep/migrate/archive
- [ ] Produce `docs/LEGACY-DATA-MAP.md`: every old field → our new field (or "dropped, why")
- [ ] List data-quality problems found (products without codes, customers without limits, negative stock) — these become import-tool requirements
- [ ] Draft import spreadsheet templates (products, batches, customers, suppliers, opening stock)

### D. Dev C — Frontend Foundations + Wireframes (definition of done: "shell runs, key screens sketched")

- [ ] React + Vite + TanStack Query + shadcn/ui + Tailwind app shell with login screen
- [ ] Sidebar navigation matching the new module map (Dashboard, Master Data, Procurement, Inventory, Sales, Field Sales, Finance, Claims, Reports)
- [ ] Wireframes (paper or Figma, low-fi is fine) for Phase 1's four key screens:
      1. Stock Receipt (against PO, batch + expiry entry)
      2. Product/Batch master
      3. Fresh Sales Invoice (with pricing + tax preview lines)
      4. Counter Sales (keyboard-driven: F2 search, Enter add, F9 pay+print)
- [ ] Draft the RBAC role list (admin, accountant, warehouse, booker, counter, owner) for review

---

## 0.4 Week 2 — Schema, Decisions, Green Pipeline

### E. Database Schema Draft (you + Dev A + Dev B)

Design and review the core v1 tables (from legacy analysis §2.1 — nothing new invented):

```
companies, products, batches, customers, suppliers, territories, salesmen, users, roles
purchase_orders, purchase_order_items, stock_receipts, stock_receipt_items
stock_movements (append-only!), warehouses, van stock as warehouse location
sales_invoices, sales_invoice_items, sales_returns, sales_return_items
credit_notes, debit_notes, adjustments, claims (pending PRS answer)
customer_ledger_entries, supplier_ledger_entries, journal_entries, vouchers
pricing_rules (company scheme / customer terms / qty slabs), bonus_rules
```

**Hard rules while designing:**
- `stock_movements` is append-only; current stock is always computed
- Every financial document is immutable once posted (void = new document)
- Every batch movement carries `batch_id` + `warehouse_id`
- Money = integer paisa or `NUMERIC(15,2)` — never float
- Catalog odd attributes go in `products.attributes` JSONB

Deliverable: `docs/SCHEMA.md` + working migration files.

### F. Tax Engine Homework (read-only, before Module 2 build)

- [ ] Collect how each top company treats GST on invoices today (absorbed vs charged)
- [ ] Photograph 3 real mixed invoices (one tax-absorbing company + one strict like GSK)
- [ ] Write findings into `docs/TAX-FINDINGS.md` — input for Module 2 design

### G. Environment & Deploy (Dev A)

- [ ] VPS rented, Docker Compose deployed, staging URL live with login screen
- [ ] Nightly `pg_dump` → Backblaze B2 job running (test a restore!)
- [ ] Sentry + Uptime Kuma connected

### H. Wireframe Review (Dev C + you + one real user)

- [ ] Walk the 4 wireframes through with the warehouse/counter staff
- [ ] One champion user nominated for the parallel run (record who)

---

## 0.5 Phase 0 Exit Criteria (all must be ✅ to start Phase 1)

- [ ] All owner questions answered; answers written into `MASTER-BLUEPRINT.md` §2.3
- [ ] Old data exported and mapped (`LEGACY-DATA-MAP.md` exists)
- [ ] `compose up` gives a clean machine a running skeleton with auth + one test module
- [ ] Staging URL live, backups restore-tested
- [ ] `SCHEMA.md` reviewed and signed off
- [ ] Wireframes for the 4 Phase-1 screens approved by real users
- [ ] Tax findings documented (`TAX-FINDINGS.md`)
- [ ] Phase 1 ticket list written (import tool → master data → PO/receipt → stock ledger → fresh/counter sales)

---

## 0.6 Risks to Watch in Phase 0

| Risk | Signal | Counter-move |
|---|---|---|
| Owner too busy for discovery | Meetings postponed twice | Do the meeting at his counter during work hours; bring printed checklists, 45 min max |
| Old data unusable/no export | Dev B stuck by day 3 | Fall back to manual Excel entry of master data; photos of reports as source |
| Schema bikeshedding | 3 days of debates | Timebox: you (PM) decide, write it in SCHEMA.md, move on |
| Perfectionism on skeleton | Week 2 with no staging URL | Skeleton = auth + one CRUD only. Features come in Phase 1 |

---

## 0.7 What Phase 0 does NOT include

- No microservices extraction
- No Flutter work yet (Phase 3)
- No tax engine coding yet (design only — needs Module 2 coaching)
- No payroll, no BI, no customer portal

> **One sentence to end every day with:** *"Can a clean machine run the system,
> and does every stock/money number in it have a document behind it?"*
> When the answer is yes at the end of Phase 0, we build Phase 1 on rock.
