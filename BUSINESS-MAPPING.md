# BUSINESS MAPPING & REQUIREMENTS
## As-Is → To-Be: Every Flow, Every Pain, Every Solution
### Version 2.0 — corrected against the real business (warehouse ERP + paper order pads)

> **The key fact this document is built on:**
> The warehouse ALREADY runs a complete desktop ERP ("Distribution Management
> System" — see photo). It works, but only at ONE computer, used by ONE main
> person. Everything around it — order taking, recovery, salesman dealings —
> runs on PAPER.
>
> **Our job:** rebuild the ERP modern (cloud, multi-user, mobile), keep its
> proven logic, kill every paper, and make the tax, salesman, and recovery
> flows automatic.

---

# 1. THE CAST (people in the business)

| Role | What they do today |
|---|---|
| **Owner/Main Person** | The only one with real access to the desktop ERP. Types all orders, generates all invoices, controls everything |
| **Bookers** | One per area. Carry pre-printed order pads to medical stores, bring filled pads to warehouse, then collect payments (recovery) from each store |
| **Medical Stores** | Fill quantities on the booker's pad. Refuse to pay the newly imposed Malakand tax |
| **Salesmen (independent sellers)** | Have their own customers. Buy stock from the distribution (the invoice is theirs, they pay), earn their OWN percentage set by themselves — not paid by the distribution. Stores can order "on behalf of" a salesman |
| **Accountant/Accounts side** | Vouchers, ledgers, cash book — currently in the desktop ERP |
| **Warehouse staff** | Receive goods (batch + expiry), pick and dispatch orders |
| **Manufacturing Companies** | GSK, Abbott, Getz... Some ABSORB the new tax for the stores; strict ones (GSK) refuse — stores pay tax on their items |

---

# 2. FLOW A — ORDER TO DELIVERY (the paper pad flow)

## 2.1 As-Is (today)

```
1. Booker visits shops in his area carrying PRE-PRINTED ORDER PADS:
   - grouped by company, every medicine with its UNIQUE ID
   - BLANK quantity column → the MEDICAL STORE writes the quantities
2. End of day: bookers bring pads to the warehouse
3. Pads pile up → THE ONE PERSON types each order into the desktop ERP
4. ERP generates invoice(s) → order picked → delivered
5. Paper pads filed away somewhere
```

## 2.2 Pains

| # | Pain | Cost to business |
|---|---|---|
| A1 | Bottleneck: many bookers' pads → one man, one keyboard | Orders processed a day late; chaos when pads pile up ("many invoices" confusion) |
| A2 | Re-typing errors: wrong product/qty entered from handwriting | Wrong goods delivered, returns, disputes |
| A3 | No stock check when the store writes the order | Store orders what's already out of stock → short deliveries, extra trips |
| A4 | No credit-limit check at order time | Goods delivered to shops already maxed out → bad debt |
| A5 | Booker is blind in the field | Can't tell the shop their balance, last prices, or schemes |
| A6 | The pad is also the only record | Lost pad = lost order, no trace |

## 2.3 To-Be (the fix)

```
1. Booker opens MOBILE APP at the shop → picks the shop → sees the same
   company-wise catalog with the same unique IDs → enters quantities
   (the store can dictate, exactly like the pad — just digital)
2. App shows the shop's balance and available credit LIVE (booker stays
   informed — collecting cash is his job). NO hard blocking in v1;
   automatic credit shield is a FUTURE phase
3. Order saved on the phone (works with NO internet), auto-sends when
   signal returns
4. Warehouse sees a digital ORDER QUEUE: each order tagged with booker,
   area, shop, status (RECEIVED → INVOICED → PICKED → DELIVERED → PAID)
5. Invoice generation = one click (or auto) — no re-typing, no pile-up
6. Pick list printed/shown with FEFO batches already chosen
```

**Killed papers:** order pad, re-typing, the pile-up at the main person's desk.
**The main person is no longer a bottleneck — he approves and oversees.**

---

# 3. FLOW B — MONEY RECOVERY (booker as collector)

## 3.1 As-Is

- Booker's second job: collect payment from each store.
- Recoveries recorded by hand / memory / later typed into ERP.
- Shop ledgers argued about; owner sees receivables late.

## 3.2 To-Be

- Booker records the recovery **in the app at the shop**: amount, mode
  (**cash or bank — both happen**).
- Customer ledger updates instantly; receipt (printed or SMS/WhatsApp later) generated.
- Shop balance stays visible to the booker for the next visit — collecting
  and staying informed is his job (no auto-block in v1; future phase).
- Owner's dashboard: today's recoveries per booker, overdue shops, area-wise recovery rate.
- DSR (Daily Sales Report) per booker generates itself: orders, deliveries, returns, recovery.

**Killed papers:** recovery register, hand-written DSR.

---

# 4. FLOW C — THE SALESMAN CHANNEL (independent sellers)

## 4.1 The business rules (CONFIRMED by owner)

- A salesman has HIS OWN customers and sells in his own territory.
- He buys stock from the distribution → **the invoice is billed TO HIM and
  the distribution collects the money from HIM — never from his stores.**
- **The distribution always gets its own profit, no matter what.** How much
  the salesman charges the medical store is HIS decision — his percentage
  never comes from the distribution.
- The salesman **does NOT own or hold stock** — the distribution provides
  and delivers everything (on his terms: he may pay first or step by step).
- A medical store can place an order **"on behalf of" a salesman** — the
  supply route goes through him: distribution bills and collects from HIM.
- **Weekly area calendar:** every area (Madain, Chakdara, Bajaur, Timergara,
  ...) has its own ORDER DAY and DELIVERY DAY each week. A salesman can
  cover one, two, or many areas.

## 4.2 As-Is pains

- Salesman dealings tracked by hand: what he bought, what he owes.
- "On behalf of" orders blur who the real debtor is → disputes.
- No visibility of his sales, so no trust and no growth planning.
- Delivery days managed by memory and phone calls.

## 4.3 To-Be

- **Salesman = a customer account with special powers:**
  - own ledger (receivable, payments, own payment terms ❓ per salesman)
  - linked list of his stores and his AREAS (one or many)
  - distribution never bills his stores — only him
- **Order routing flag:** every order carries `via: SALESMAN_X` or `DIRECT`.
  - `via SALESMAN_X` → invoice billed to salesman X; delivery scheduled to
    the store (drop-ship) or to him; recovery tracked against HIM.
  - `DIRECT` → normal booker flow, billed to the store.
- **Weekly Area Calendar** in the system: per area — order day + delivery
  day. Booker app shows "today's areas"; delivery runs are planned from it.
- Reports: salesman-wise sales, outstanding, recovery → the distribution sees
  the whole channel and can grow the good salesmen.

## 4.4 The PREPAID DEALER type (discovered — separate from salesmen)

- Some people **buy the stock FIRST and then sell to stores**.
- Rule: **they must PAY FIRST — only then does the distribution deliver**
  (delivery to that person; the distribution delivers everything).
- In the system: customer account type `PREPAID`:
  - order release is blocked until received payments cover the order value
  - every order auto-checks his advance balance
- Contrast: `SALESMAN` accounts follow their own agreed payment terms;
  `REGULAR` stores follow normal booker recovery flow.

---

# 5. FLOW D — THE DYNAMIC TAX ENGINE (the heart of the invoice)

## 5.1 The real story

- Tax was **recently and officially imposed** on Malakand Division.
- **Medical stores protest — they refuse to pay it.**
- To keep selling, some pharma companies **absorb the tax on the stores'
  behalf** (for now — "for some months").
- Strict companies (**GSK**) refuse: on their items, **the store pays the tax.**
- One invoice mixes items from many companies → mixed tax treatment per line.
- **Old software: taxes EVERYTHING → staff manually recalculates the excluded
  tax every time.** Slow, error-prone, untraceable.

## 5.2 The engine design

**Rule chain per invoice line (three switches):**

```
1. COMPANY POLICY  → does the company ABSORB or is it STRICT, on the invoice date?
2. CUSTOMER STATUS → is THIS store a FILER or NON-FILER?
3. RATE TABLE      → FILER = 0.5% | NON-FILER = 2.5%  (configurable, date-effective)

line tax = qty × price × rate(customer filer status)
  STRICT line    → tax ADDED to what the store pays
  ABSORBING line → tax NOT charged to store; tracked per company + filer status
```

**Example 1 — Noor Medical Store is a FILER (0.5%):**

| Item | Company | Price | Policy | Tax | Store pays |
|---|---|---|---|---|---|
| Panadol 500mg | GSK | Rs. 100 | STRICT | Rs. 0.50 → charged | **Rs. 100.50** |
| Brufen 400mg | Abbott | Rs. 100 | ABSORBING | Rs. 0.50 → tracked, NOT charged | **Rs. 100.00** |

**Store pays Rs. 200.50** · Tax charged from store: Rs. 0.50 (GSK)
· Tax absorbed for store: Rs. 0.50 (Abbott → goes into the Abbott statement)

**Example 2 — same order, but the store is a NON-FILER (2.5%):**

| Item | Company | Price | Policy | Tax | Store pays |
|---|---|---|---|---|---|
| Panadol 500mg | GSK | Rs. 100 | STRICT | Rs. 2.50 → charged | **Rs. 102.50** |
| Brufen 400mg | Abbott | Rs. 100 | ABSORBING | Rs. 2.50 → tracked, NOT charged | **Rs. 100.00** |

**Store pays Rs. 202.50** · Abbott statement now carries Rs. 2.50 tagged NON-FILER.

→ The filer status changes BOTH what a strict company charges the store AND
what an absorbing company reimburses. All automatic, per line.

## 5.3 The recovery cycle (CONFIRMED: company statements + filer status)

- The distributor prepares **statements for the absorbing companies**:
  product-wise sold quantities + the tax absorbed on each, split by the
  **FILER / NON-FILER status** of the store (the tax cut differs for each).
- Statement sent to the company → company reimburses the absorbed tax
  accordingly → tracked in a claim ledger until the money arrives.
- The system therefore needs:
  - `filer_status` flag on every customer (medical store), editable
  - every invoice line's absorbed tax tagged with that store's filer status
  - a **company-wise statement report** (product-wise sales + absorbed tax,
    grouped filer vs non-filer) generated for any date range
  - claim tracking: statement sent → reimbursed → money received

## 5.4 Why it is "dynamic"

- Abbott announces: "from March 1 we stop absorbing." → Change the company's
  policy once (new policy + effective date). **Every invoice from March 1
  onward charges the store automatically.** Zero manual recalculation.
- History is safe: old invoices keep the policy that was valid on their date.
- ❓ Open (see Q1-follow-up in §11): the EXACT filer/non-filer math — does the
  store's invoice price differ by filer status, or does the store always pay
  the same and only the company reimbursement differs? Need one real example
  invoice pair to lock the formula.

**Killed papers:** manual tax recalculation sheets.

---

# 6. FLOW E — PROCUREMENT (buying from companies)

| As-Is | To-Be |
|---|---|
| Purchase orders and receipts in desktop ERP, one user | Same flow, cloud: PO → Stock Receipt (actual qty, batch, expiry) linked to PO; partial receipts tracked |
| Supplier payable in ERP | Auto-posted to supplier ledger |
| Expiry losses found too late | Weekly expiry report (30/60/90/180 days) → return to company → claim tracked to recovery |

---

# 7. FLOW F — RETURNS

| Return type | Rule | To-Be |
|---|---|---|
| Fresh Return (saleable) | Back to normal stock | Return document linked to invoice; stock IN, store balance credited |
| Short Return | Shortage reported | Tracked; becomes credit note and/or company claim ❓ (confirm, Q5) |
| Expired/Damaged Return | NEVER resellable | Stock IN to quarantine; expiry/damage claim to company |

---

# 8. FLOW G — ACCOUNTING (fully automatic)

- Every document (invoice, receipt, payment, return, credit note, adjustment)
  posts its own double-entry journal.
- Customer ledgers, supplier ledgers, cash book, expenses — all self-writing.
- Invoices are **never edited**: Void + Reissue or Credit/Debit Notes.
- Stock numbers are **never overwritten**: adjustments are documents with reasons.

---

# 9. CONSOLIDATED FUNCTIONAL REQUIREMENTS

### FR-1 Catalog & Master Data
- Products with unique IDs (keep the SAME IDs from the pad/old ERP), company,
  pack, batch, expiry, prices
- Company master with **tax policy history** (absorbing/strict + effective dates)
- Customers with credit limits, areas, opening balances
- Excel import from old system data

### FR-2 Booker Mobile App (offline-first)
- Shop list with balances, history, schemes
- Company-wise order entry mirroring the paper pad (same IDs)
- Offline save + auto-sync; balance/credit VISIBLE (no blocking in v1 —
  future phase)
- **Today's areas** from the weekly area calendar (order day / delivery day)
- Recovery entry (cash or bank); daily DSR auto-generated

### FR-3 Warehouse Order Queue & Invoicing
- Digital queue of incoming orders (by booker/area/status)
- One-click invoice generation with pricing engine (company scheme → customer
  terms → qty slabs → bonus "buy 10 get 1") + **dynamic tax engine**
- FEFO batch allocation on the pick list

### FR-4 Dynamic Tax Engine
- Per-company policy (ABSORBING/STRICT) with effective dates
- Customer `filer_status` flag (FILER / NON-FILER) — **admin-only edit**;
  a store that registers as a filer informs the admin, who changes the tag
  (change is dated + audit-logged)
- Rate table: FILER = 0.5%, NON-FILER = 2.5% — configurable and
  date-effective (government can change rates; old invoices keep their rates)
- Per-line computation on invoice date; invoice shows both totals
  (charged from store / absorbed for company)
- Company-wise statement report: product-wise sales + absorbed tax grouped
  filer vs non-filer, for any date range → feeds company reimbursement claims
- Policy/rate history preserved on old invoices — nothing ever recalculated
- Phase 0 check: verify the math against 2 real invoices (one filer, one
  non-filer store) before coding

### FR-5 Salesman & Dealer Channel
- Salesman accounts: own ledgers, own payment terms (pay first or step-by-step),
  own stores, own AREAS (one or many) — NEVER billed to his stores
- **Weekly Area Calendar:** per area order day + delivery day; delivery runs
  planned from it; app shows today's areas
- Order routing flag (`via SALESMAN` vs `DIRECT`); billing/recovery to salesman
- **PREPAID dealer accounts:** order release blocked until payments cover
  the order value; distribution delivers
- Salesman-wise and dealer-wise sales/outstanding/recovery reports

### FR-6 Inventory Core
- Append-only stock ledger (every movement a document)
- Batch + expiry tracking, FEFO picking, quarantine stock for expired/damaged
- Multi-location: main warehouse + vans (+ salesman stock if he holds any ❓ Q4)
- Transfers, adjustments with reasons, cycle counts

### FR-7 Finance
- Vouchers (cash/bank receipt & payment), journal entries, expenses
- Customer/supplier ledgers, cash book — all auto-posted from documents
- Credit notes / debit notes as documents; invoice void+reissue (no edits)

### FR-8 Claims (with companies)
- Expiry/damage/short claims tracked per company until money recovered
- ❓ PRS exact meaning and flow (Q6)

### FR-9 Reporting & Owner Dashboard
- Live: sales, receivables, cash, recoveries per booker, expiring stock
- Stock, expiry, DSR, customer/supplier ledgers, annual summaries
- Tax reports: charged vs absorbed, company-wise

### FR-10 Users & Security
- Roles: Owner, Accountant, Warehouse, Booker, Salesman, Counter
- Full audit trail: who did what, when
- The "main person" becomes admin — oversight without being the bottleneck

---

# 10. PLATFORM MAP (who gets what)

| User | Platform | Key screens |
|---|---|---|
| Owner | Web dashboard | Live KPIs, approvals, all reports |
| Accountant | Web | Vouchers, ledgers, cash book, credit/debit notes |
| Warehouse | Web (keyboard-first) | Order queue, stock receipt, pick lists, transfers, counter sales (F2/Enter/F9) |
| Booker | **Mobile (offline)** | Shop list, order pad (digital), credit shield, recovery, DSR |
| Salesman | **Mobile** | His orders, his ledger, his stores |
| Counter | Web (hotkeys) | Cash sale in <60 seconds |

---

# 11. OPEN QUESTIONS — status after owner answers (updated)

- ✅ **Q1. Absorbed-tax recovery** — ANSWERED: company-wise statements of
  product-wise sales + absorbed tax, split by store's filer/non-filer status;
  company reimburses accordingly; tracked until money received.
- ✅ **Q2. Salesman pricing** — ANSWERED: distribution always keeps its own
  profit; invoice billed to salesman; his retail price is his own business.
- ✅ **Q3. Credit shield** — ANSWERED: NO blocking in v1; balances visible to
  bookers (his job to collect); auto shield = future phase.
- ✅ **Q4. Salesman stock** — ANSWERED: salesmen never hold stock; distribution
  delivers; terms vary per salesman (pay first or step-by-step). PLUS new
  finding: PREPAID dealers exist who must pay before delivery.
- ✅ **Q8. Recovery money** — ANSWERED: both cash and bank happen; recorded
  per collection with mode.

**Still open:**

- ✅ **Q1-f. Filer/non-filer exact math** — ANSWERED: FILER = 0.5%,
  NON-FILER = 2.5% on invoice value, by the STORE's filer status. Strict
  companies charge it to the store; absorbing companies' amounts are tracked
  and recovered via company statements. *(Phase 0: verify against 2 real
  invoice photos before coding.)*
- ❓ **Q5. Short returns:** free re-delivery, credit note to store, or company
  claim — which, and when?
- **Q6. PRS:** exact meaning and paper flow (Pending PRS, PRS Recovery, PRS
  Expenses in the old ERP menu).
- **Q7. FBR/fiscal invoicing:** is there any government e-invoicing requirement
  on the distributor now that tax is imposed, or is tax handling purely on
  paper invoices for now?
- **Q8. Recovery money:** do bookers handle cash themselves, or do shops pay
  into the bank? How is a booker's collection reconciled daily?

---

# 12. ONE-PARAGRAPH SUMMARY

> A Malakand medicine distributor runs a complete desktop ERP at one computer
> with one operator, while everything around it runs on paper: bookers carry
> pre-printed order pads, the pads pile up on one desk, orders are retyped a
> day late with no stock or credit checks, recoveries live in registers, and
> the newly imposed tax forces staff to manually recalculate every mixed
> invoice because some companies absorb the tax and strict ones like GSK do
> not. We rebuild the ERP in the cloud with the same proven logic and the same
> product IDs, give bookers and salesmen offline mobile apps that replace the
> pads and check credit limits live, turn the one-man bottleneck into a digital
> order queue, make the tax engine compute per line from each company's
> date-based policy automatically, and self-write every ledger and report —
> so the only paper left is the invoice in the customer's hand.
