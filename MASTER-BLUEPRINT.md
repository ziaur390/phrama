# PHRAMA — Pharmaceutical Distribution Management System
## Master Blueprint v1.0 (Malakand Division, KPK, Pakistan)

> **How to use this document:** This is the single source of truth for the development team.
> Each section describes *what the system must do* and *why it was decided this way*.
> Items marked ❓ **NEEDS CONFIRMATION** must be verified with the business owner before
> that feature is built. Do not guess on those items.

---

# PART 1 — ARCHITECTURE & TECH STACK (3-Developer Optimized)

## 1.1 The Strategy: "Boring Tech, Clear Walls"

We are 3 developers building a business-critical ERP. Our biggest risk is
**over-engineering before revenue**, not choosing the wrong framework.

**Decisions:**

| Decision | Choice | Reason |
|---|---|---|
| Backend | **One NestJS (TypeScript) modular monolith** | Shared types with React, fast to build, one deploy. Module walls allow extracting microservices later |
| High-perf services (Go) | **Deferred** | NestJS on one VPS handles thousands of orders/day. Add Go only when profiling proves a bottleneck |
| Message queue | **BullMQ (Redis-based)** | Event-driven power with zero new infrastructure. No Kafka/RabbitMQ |
| Databases | **PostgreSQL + Redis only** | No MongoDB initially. Catalog uses JSONB columns inside Postgres |
| Web frontend | **React + Vite + TanStack Query + shadcn/ui** | Fast, modern, keyboard-first capable |
| Mobile | **Flutter + SQLite (drift)** | One codebase → Android. Offline-first via local SQLite |
| Hosting | **Single VPS + Docker Compose** | Cheap, simple, one server to babysit |
| CI/CD | **GitHub Actions → SSH deploy** | Free tier |
| Errors / uptime | **Sentry free + Uptime Kuma (self-hosted)** | $0 |

## 1.2 Backend Module Layout (the walls are the architecture)

```
apps/api/src/
  auth/          ← JWT, roles, permissions (RBAC)
  catalog/       ← products, companies, batches definition, pricing rules
  inventory/     ← stock ledger, batches stock, transfers, adjustments, quarantine
  orders/        ← bookings, fresh sales invoices, counter sales
  tax-engine/    ← item-level Malakand GST logic (see Module 2 doc)
  ledger/        ← double-entry: journals, vouchers, customer/supplier ledgers
  claims/        ← expiry/damage/short claims to companies (PRS) ❓ NEEDS CONFIRMATION
  sync/          ← booker offline-sync endpoints (conflict resolution)
  field-sales/   ← territories, salesmen, DSR, van stock
  employees/     ← master records only in v1 (payroll = Phase 2)
libs/shared/     ← TypeScript DTOs shared with web + mobile
```

**Rule:** modules communicate only through their public services or events
(`InvoiceCreated`, `PaymentReceived`, `StockChanged`, `OrderSynced`).
When a module needs independent scaling, lift the folder out as a microservice.

## 1.3 Infrastructure & Cost (~$60/month)

| Piece | Choice | Cost |
|---|---|---|
| VPS | Hetzner CPX31 / DigitalOcean 4GB | $25–45/mo |
| Docker Compose | api + postgres + redis + nginx | $0 |
| Backups | nightly `pg_dump` → Backblaze B2 | ~$1/mo |
| CDN / SSL | Cloudflare free tier | $0 |
| Monitoring | Sentry free + Uptime Kuma | $0 |
| CI/CD | GitHub Actions | $0 |

**Upgrade path (only when something hurts):**
managed Postgres → second VPS → extract `sync` service → Kubernetes.

## 1.4 The Four Golden Rules (memorize, repeat to team)

1. **"Cache for looking. Database for deciding."**
   Redis = fast reads for display. Any *decision* (credit limit check, stock
   reservation at invoice time) is re-verified against **Postgres inside the same
   transaction** that writes the result. Redis keys are updated by events
   (`PaymentReceived`, `InvoiceCreated`, `StockChanged`) and carry a short TTL
   (e.g., 60s) as a safety net. Redis is never the system of record.

2. **"Money has one shape — money lives in Postgres."**
   Ledgers, invoices, journal entries, payments: relational, ACID, foreign keys.
   An invoice is a transaction across 5+ tables (header, items, customer ledger,
   journal, stock ledger). All succeed or all roll back. Never MongoDB.

3. **"Append-only ledgers, never overwritten numbers."**
   Stock and money are stored as movement/journal entries. Current balance =
   computed from history. Every discrepancy is explainable.

4. **"Documents, not edits."**
   Every state change is a document (invoice, credit note, adjustment, void).
   Historical financial documents are **never silently edited** (see 3.3).

---

# PART 2 — LEGACY SYSTEM ANALYSIS (Keep / Replace / Kill / Confirm / Defer)

The previous desktop DMS validated the business logic over years of real use.
We keep its gold, kill its liabilities, and modernize the shell.

## 2.1 🏆 KEEP — crown jewels

| Legacy concept | Why it's gold | New system mapping |
|---|---|---|
| Batch tracking + **FEFO** (First-Expiry-First-Out) | Pharma non-negotiable; prevents expired-stock losses | `batches` table + auto-pick in invoice engine |
| **Stock Ledger** (append-only movements, not a qty field) | Always able to answer "why is stock 650?" | `stock_movements` append-only table (event-sourced inventory) |
| Double-entry vouchers (journal, cash/bank payment/receipt) | Validated accounting backbone | `ledger` module, same voucher types |
| Fresh Return vs Short/Expired Return split | Saleable vs quarantine separation | Return doc with `disposition`: SALEABLE / DAMAGED / EXPIRED |
| Credit Notes / Debit Notes as documents | Financial corrections must be documents | Proper document types linked to source invoices |
| Company-wise + Customer-wise discounts, Bonus (buy 10 get 1) | This IS pharma pricing reality | Pricing engine layers: base → company scheme → customer terms → qty slab → bonus |
| Fresh Sales vs Counter Sales channels | Real channels: credit sale vs cash-at-counter | Sales channel field + different default payment behavior |
| Territory → Salesman → Customer hierarchy | Needed for DSR, targets, Modules 3–4 | `territories`, `salesmen`, assignments |
| Purchase Order → Stock Receipt (linked, partial receipts) | Traceability of what arrived vs ordered | `stock_receipts.purchase_order_id`, status: PENDING / PARTIAL / RECEIVED |
| Opening Stock Entry as first-class document | Clean day-one migration | `stock_movements` opening entry |
| Multi-warehouse Transfer Out/In | Company still owns stock, just moved | Internal transfer doc, no accounting P&L impact |
| Customer ledger (opening + sales − payments − credits = closing) | The receivables backbone | `ledger` module customer sub-ledger |

## 2.2 🔴 KILL / REPLACE — liabilities

| Legacy concept | Why dangerous | Replacement |
|---|---|---|
| **Invoice Edit** (edit historical invoices) | Destroys audit trail, breaks reconciliation, how money disappears | **Void + Reissue.** Invoice never edited. Void (reason + permission + timestamp) → corrected invoice, or Credit Note for partial changes |
| **Dummy Sales Invoice** | Untracked stock/money movement = auditor's nightmare | Kill. Testing → demo env. Gifts/replacements → explicit **FOC / Replacement Issue** document with proper accounting |
| Storing stock as a plain qty column | Discrepancies unexplainable | Stock ledger + **Stock Adjustment** document with mandatory reason |

## 2.3 ❓ NEEDS CONFIRMATION — ask the business owner before building

| Item | Question to ask | Working assumption (do NOT build on it yet) |
|---|---|---|
| **PRS** (PRS Reports, Pending PRS, PRS Recovery, PRS Expenses) | What does PRS stand for here? Get the actual paper flow: who claims whom, what documents, what timelines | PRS = the claims cycle with manufacturing companies (expiry / damage / bonus-scheme claims: "we returned 100 units, company owes Rs. X") |
| **SPO Setup** | Is SPO = Sales Promotion Officer? What is their role in orders and incentives? | A real Pakistani pharma role between company and distributor |
| **Short Return** | When a customer reports shortage, does the distributor re-deliver free, credit the customer, or claim against the company? All three? | Claim against company + credit note to customer, tracked separately |
| **Credit Note approval** | Who can issue a credit note? Is there a value threshold above which the owner approves? | Role-based; large values require owner approval |
| **Credit limit behavior** | Hard block (system refuses) or warn-only (salesman overrides with reason)? | ✅ ANSWERED: NO blocking in v1 — balances visible to bookers only (collecting is his job). Auto credit shield = future phase. EXCEPTION: PREPAID dealer accounts must have payment coverage before order release |
| **Bonus (buy 10 get 1) accounting** | Is bonus stock free for us too (company gives it free) or do we pay the company for it? | Company gives free; bonus qty carries zero cost, zero tax, shows on invoice as FOC line |
| **Invoice numbering** | FBR/PRAL requirements: series, format, any fiscal-invoice rules for Malakand region? | To be confirmed in Module 2 (tax engine) work |
| **Salary/Payroll scope** | Full payroll in Phase 2, or never (use separate payroll software + journal entries)? | Journal entries only in v1 |

## 2.4 🕐 DEFER — not in v1

- **Full payroll module** (salaries via journal entries in v1; employee *master records* are in v1 because salesman assignment needs them).
- **Multi-company / multi-currency** — PKR only, single legal entity.
- **Advanced BI dashboards** — basic reports first, BI later.
- **E-commerce / customer portal** — field booker app covers ordering.

---

# PART 3 — CORE WORKFLOWS (Step by Step)

> Every workflow below follows Golden Rule 3 & 4: documents and ledgers, no edits.

## 3.0 Master Data First (nothing works without it)

Order of setup:
1. **Companies** (manufacturers: GSK, Abbott, Getz, ...) → drives discount schemes & tax behavior (Module 2)
2. **Products** (code, name, category, company, pack, sale price, tax flag) → catalog with JSONB `attributes` for odd fields
3. **Batches** (per product: batch no, mfg/expiry, cost price) → FEFO depends on this
4. **Suppliers** (= companies/distributors we buy from) with opening payables
5. **Customers** (retail pharmacies/hospitals) with credit limits + opening receivable balances
6. **Territories → Salesmen → Customer assignments**
7. **Users & Roles** (RBAC: admin, accountant, warehouse, booker, salesman)
8. **Opening Stock Entry** (document: product, batch, qty, warehouse) → first entries in stock ledger
9. **Opening customer/supplier balances** via Journal Entry

## 3.1 Procurement: Purchase Order → Stock Receipt → Payable

```
1. Create Purchase Order (PO)          → supplier, product, qty, agreed cost
2. Goods arrive                        → create Stock Receipt linked to PO
3. Receipt records ACTUAL qty + batch + expiry of what physically arrived
   (ordered 1,000 → received 980: PO becomes PARTIAL, short 20 tracked)
4. On receipt POST (one DB transaction):
   - stock_movements: +IN per batch (FEFO position computed from expiry)
   - supplier ledger: payable increases by receipt value
   - journal: Inventory Dr / Supplier Payable Cr
5. PO status → PARTIAL or RECEIVED
```

## 3.2 Sales: Fresh Sales Invoice (credit channel)

```
1. Order source: booker app / web / warehouse (see Modules 3 & 4)
2. SYSTEM CHECKS (inside one Postgres transaction — Golden Rule 1):
   a. Credit limit: customer balance + this invoice ≤ credit limit?
      → if no: hard block or salesman-override-with-reason ❓ per 2.3
   b. Stock: reserve quantities batch-by-batch (FEFO: earliest expiry first)
3. Pricing engine applies layers in order:
   base price → company scheme → customer terms → qty slab discount → bonus lines
4. Tax engine computes item-level GST (Module 2) → tax-absorbed vs tax-charged lines
5. Invoice POSTED (one transaction):
   - invoice header + items (immutable from now on)
   - stock_movements: −OUT per batch (FEFO picks the batches)
   - customer ledger: + receivable (or cash receipt if counter sale)
   - journal: Receivable Dr / Sales Cr (+ GST lines per tax treatment)
   - events published: InvoiceCreated, StockChanged
6. Delivery: van/warehouse picks against the frozen batch allocation
```

**Counter Sales channel:** same engine, but payment is captured at counter
(cash receipt posted with the invoice; customer ledger untouched for walk-ins).

## 3.3 Corrections: NO EDITS, ONLY DOCUMENTS

| Situation | Document | Effect |
|---|---|---|
| Wrong invoice, caught early | **Void** (reason + permission + timestamp) | Reverses stock + ledger + journal fully; original stays visible as VOID |
| Price/qty dispute on part of invoice | **Credit Note** linked to invoice | Customer balance ↓, stock back per disposition |
| We undercharged the customer | **Debit Note** | Customer balance ↑ |
| Supplier owes us (expiry/damage/short) | **Claim** against company ❓ (PRS) | Supplier/claim ledger adjusted |
| Gift / free replacement | **FOC / Replacement Issue** | Stock out, zero revenue, explicit accounting line — not a "dummy invoice" |

## 3.4 Returns: Fresh Return vs Short/Expired Return

```
Customer returns goods → create Sales Return linked to original invoice
Per line, warehouse inspects and sets disposition:
  SALEABLE  → stock IN to normal sellable stock (same batch rules)
  DAMAGED   → stock IN to quarantine (never sellable; claim candidate)
  EXPIRED   → stock IN to quarantine (never sellable; expiry claim candidate)
Customer ledger: balance reduced by return value (or Credit Note issued)
Journal: Sales Return Dr / Receivable Cr
```

## 3.5 Expiry Lifecycle (batch-level, critical)

```
1. Expiry report: batches expiring in 30/60/90/180 days (weekly auto-report)
2. Decision per batch: return to company / discount-sell / write off
3. Return to company → stock IN to quarantine → Claim created ❓ (PRS)
4. Company accepts claim → supplier ledger credited (money recovered)
5. Fully expired & unclaimed → Stock Adjustment (reason: EXPIRED WRITE-OFF)
   → loss recognized in journal
```

## 3.6 Stock Accuracy Cycle (the 480-vs-500 answer)

```
Physical count says 480, system says 500.
1. Nobody edits the number.
2. Create Stock Adjustment document: counted 480, difference −20, mandatory reason
   ("cycle count correction") + permission + timestamp.
3. Ledger appends the movement. History now PROVES:
   opening + receipts − sales + returns − adjustment = 480
4. Journal: Inventory Shrinkage Dr / Inventory Cr
5. Large/unexplained discrepancies trigger investigation, not silent fixes.
```

## 3.7 Payments & Cash

```
Customer pays → Cash/Bank Receipt Voucher
  → customer ledger balance ↓, journal: Cash Dr / Receivable Cr
  → event PaymentReceived → Redis balance cache updated
We pay supplier → Cash/Bank Payment Voucher → payable ↓
Expenses → General Expense Entry (rent, fuel, electricity, salaries)
Cash Book = running cash ledger (opening + in − out = balance)
```

## 3.8 Field Sales (summary — details in Modules 3 & 4 docs)

- Territories own customers; salesmen/bookers own territories.
- **DSR (Daily Sales Report):** per salesman — sales, returns, net, visits, recovery.
- Van stock = a warehouse location; salesman sales move stock Main→Van→Customer.

---

# PART 4 — MIGRATION PLAN (business must adopt smoothly)

1. **Keep the vocabulary.** Use the staff's own words: "Stock Receipt", not
   "Goods Receipt Note". Navigation mirrors the legacy module map.
2. **Excel import for master data** — products, batches, customers, suppliers,
   opening balances exported from the old system. This is a v1 feature.
3. **Opening Stock Entry** as first-class document (day one = clean ledger start).
4. **Parallel run 2–4 weeks:** old system remains the books of record while the
   new system runs live. Compare daily stock + customer balance reports.
   **Go-live condition: reports match 3 consecutive days.**
5. **One champion user** (the person who knew the old system best) sits with the
   team during the parallel run and signs off each day.

---

# PART 5 — OPEN QUESTIONS CHECKLIST (print this for the owner meeting)

- [ ] What exactly does **PRS** stand for? Walk me through the paper flow end to end.
- [ ] What is an **SPO** here and what do they do in the order flow?
- [ ] Short return: free re-delivery, credit note, or company claim — which, when?
- [ ] Credit note approval: who approves, any value thresholds?
- [ ] Credit limit: hard block or salesman override? Different for counter vs field?
- [ ] Bonus stock: does the company give it free, or do we pay for it?
- [ ] Any FBR/fiscal invoice numbering rules applicable to us in Malakand?
- [ ] Payroll: build later or keep in separate software forever?
- [ ] How many warehouses/vans/branches exist today (transfers + van stock design)?
- [ ] Who are the 3 highest-volume companies and what do their scheme letters
      (discount/bonus structures) actually look like? Get sample letters.

---

# PART 6 — GLOSSARY (team vocabulary)

| Term | Meaning |
|---|---|
| **FEFO** | First-Expiry-First-Out — sell the batch expiring soonest first |
| **DSR** | Daily Sales Report (per salesman/territory) |
| **PRS** | Claims/recovery cycle with manufacturing companies ❓ confirm expansion |
| **FOC** | Free of Charge — bonus/gift stock, zero revenue |
| **Credit Note** | Document reducing what a customer owes us |
| **Debit Note** | Document increasing what a customer owes us (or our claim on supplier) |
| **Quarantine stock** | Damaged/expired stock, never sellable, awaiting claim or write-off |
| **Stock Ledger** | Append-only movement history; current stock = computed from it |
| **Counter Sales** | Walk-in cash sales at our own counter |
| **Fresh Sales** | Credit-channel sales to regular customers via bookers/salesmen |
| **SPO** | Sales Promotion Officer ❓ confirm |
| **Tax-absorbed line** | Item whose GST the distributor absorbs (net price unchanged) — Module 2 |
