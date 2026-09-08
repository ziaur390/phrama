# PHRAMA — Team Guide
## From the Old Desktop DMS to Our New Distribution System
### Version 1.0 — For the whole team (developers + operations staff)

> This document explains three things:
> 1. **How the old system works today** (so nothing is lost)
> 2. **What we are changing** and what stays exactly the same
> 3. **Who uses which app** — mobile vs web — and why
>
> If anything in this document is unclear or wrong for how the business
> actually works, tell the project lead **before** development starts
> on that part. Questions marked ❓ need answers from the business owner.

---

# 1. Why We Are Rebuilding

The old desktop DMS did its job for years — but it is stuck on one computer,
staff must be in the office to use it, field bookers write orders on paper,
and every report is typed by hand. The business has outgrown it.

The goal of the new system is simple:

> **Every person does their job from wherever they are, the system does the
> math and the paperwork automatically, and the owner sees the truth about
> stock and money at any moment.**

---

# 2. How the Business Works Today (The Old Workflow)

The company sits between manufacturers and retail pharmacies:

```
Manufacturing Companies (GSK, Abbott, Getz, ...)
        ↓  (Purchase Orders + Stock Receipts)
   OUR WAREHOUSE  ← the heart of everything
        ↓  (Salesmen / Bookers / Counter)
Retail Customers (Medical Stores, Hospitals)
        ↓  (Invoices, Payments, Returns)
   ACCOUNTS & REPORTS
```

## 2.1 The old daily flow

1. **Setup/master data** — products, batches, customers, suppliers, prices
   were configured once, and everything depends on them.
2. **Buying** — a Purchase Order is made, goods arrive, a **Stock Receipt**
   records what *actually* arrived (often less than ordered), with **batch
   number and expiry**. The supplier's payable increases.
3. **Stock** — tracked per **batch** because medicine expires. Good staff
   sell the batch that expires soonest (**FEFO — First-Expiry-First-Out**).
4. **Selling** — two channels:
   - **Fresh Sales** — bookers/salesmen take orders from shops on credit;
     invoice is made, stock goes down, customer's balance (udhaar) goes up.
   - **Counter Sales** — a shop walks into our counter and pays cash on the spot.
5. **Pricing tricks of the trade** — discounts by company, discounts by
   customer, and **Bonus deals** (buy 10 get 1 free). The old system stores
   all of these.
6. **Returns** — three different kinds, and they must never be mixed:
   - **Fresh Return** — saleable goods come back to normal stock
   - **Short Return** — shortage reported, becomes a claim
   - **Expired/Damaged Return** — goods go to quarantine, never resold
7. **Money** — vouchers for every receipt and payment, customer ledgers
   (who owes what), supplier ledgers (what we owe), cash book.
8. **Claims with companies (PRS)** ❓ — we return expiring stock to companies
   and recover the money. The old system tracks this loosely.
9. **Reports** — stock, expiry (30/60/90 days), DSR (Daily Sales Report per
   salesman), customer ledgers, annual summaries.

## 2.2 What is WRONG with the old system (why we change)

| Problem | Effect on the business |
|---|---|
| Desktop-only, one computer | Warehouse, accountant, owner must be in the office |
| Paper orders from the field | Bookers write orders, someone retypes them — errors and delays |
| No credit-limit protection at order time | Goods delivered to shops already maxed out on udhaar |
| "Invoice Edit" and "Dummy Invoice" features | Old invoices can be silently changed — money can disappear without a trace |
| Stock stored as a bare number | If count says 480 and system says 500, nobody can explain why |
| Manual reports | Hours lost daily typing what a computer should print |
| No mobile access | Field staff blind to customer balances and stock while visiting shops |

---

# 3. What STAYS THE SAME (so nobody is scared)

The business logic of the old system is **correct and validated**. We are
changing the *tools*, not the *trade*. Staff will recognize their own words
and their own workflows:

- ✅ Same vocabulary: **Stock Receipt, Fresh Sales, Counter Sales, Bonus,
  Credit Note, DSR, Expiry Return** — no new jargon
- ✅ Same flow: Purchase Order → Stock Receipt → Sales Invoice → Payment
- ✅ Batch + expiry tracking with FEFO picking
- ✅ Company-wise and customer-wise discounts, bonus deals
- ✅ Separate handling of Fresh / Short / Expired returns
- ✅ Vouchers, customer ledgers, supplier ledgers, cash book
- ✅ Territories → Salesmen → Customers structure

**Nothing a staff member does today by habit disappears. It just gets faster
and automatic.**

---

# 4. What CHANGES (the automation)

| Old way (manual) | New way (automated) |
|---|---|
| Booker writes order on paper, office retypes it | Booker enters order on **mobile app**, reaches office instantly — even without internet (offline mode) |
| Office calls booker to check a shop's balance | Balance visible in the booker's pocket, always |
| Credit limit checked by memory or not at all | System **blocks or warns** when an order crosses the credit limit, automatically |
| Stock received typed twice (PO sheet + register) | Stock Receipt linked to the PO; shortage tracked automatically |
| Staff must remember which batch expires first | System picks the correct batch (FEFO) automatically at invoicing |
| Expiry losses discovered when it's too late | Automatic **expiry report** every week: 30/60/90/180 days ahead |
| Someone "fixes" stock numbers by hand | Every change is a **document with a reason** — discrepancies are always explainable |
| Old invoices get edited silently | Invoices are **never edited**. Corrections happen via Void / Credit Note / Debit Note — full audit trail |
| Reports typed manually | Reports generate themselves — stock, expiry, DSR, ledgers, profit |
| Owner learns problems at month-end | Owner's dashboard shows sales, receivables, cash, expiring stock — live |

---

# 5. WHO USES WHAT — Platform Map

Not everyone needs the same tool. We build **two apps** and give each role
exactly what fits their work.

## 5.1 The two apps

| App | Technology | Runs on | Used for |
|---|---|---|---|
| **Web App (Dashboard)** | React | Office PCs / laptops / browser | Office & warehouse work: everything with a keyboard and a big screen |
| **Mobile App** | Flutter (Android first) | Field staff phones | Field work: visiting shops, taking orders, collecting payments — **works offline** |

## 5.2 Role-by-role

### 👑 Owner / Admin → **Web App**
- Live dashboard: today's sales, receivables, cash position, expiring stock alerts
- Approvals: large credit notes, overrides, new user accounts
- All reports: annual, company-wise, salesman-wise, profitability
- Sets up: companies, products, prices, discount schemes, credit limits, users

### 🧾 Accountant → **Web App**
- Vouchers: cash/bank receipts, payments, journal entries, expenses
- Customer & supplier ledgers, cash book, credit/debit notes
- Bank reconciliation and claims tracking ❓ (PRS — awaiting owner confirmation)
- Month-end closes without hunting through registers

### 📦 Warehouse Staff → **Web App (keyboard-driven, hotkeys)**
- Receiving: Stock Receipt against PO (batch + expiry entry, fast keyboard flow)
- Picking & dispatch: system already decided WHICH batches to pick (FEFO) — staff just follow the pick list
- Transfers between warehouse and vans
- **Counter Sales at speed:** keyboard hotkeys — `F2` search product, `F9` pay & print, `Enter` add line. A trained counter person serves a walk-in in under a minute, no mouse needed
- Cycle counts: count → enter → system creates the adjustment document with reason

### 🛵 Field Booker (order taker) → **Mobile App (offline-first)**
- Visits shops, takes orders on the phone — **no internet needed**; orders saved locally and sync automatically when signal returns
- Sees each shop's balance and history before entering the order
- **No blocking in v1:** the balance is always visible — collecting cash is the booker's job (automatic credit shield is a future phase)
- Records cash **and bank** recoveries (payments collected in the field)
- Daily DSR is produced automatically from what he already entered — no end-of-day paperwork
- **Today's areas:** each area (Madain, Chakdara, Bajaur, Timergara...) has its own weekly ORDER DAY and DELIVERY DAY — the app shows today's areas

### 🚚 Salesman (Independent Seller) → **Mobile App**
- Has his own customers and his own areas (one or many); the distribution
  delivers everything — **he never holds stock**
- Orders via him are **billed to HIM** — the distribution collects from him,
  never from his stores; whatever he charges them is his own business
- The app shows him his orders, his ledger (what he owes), and his areas'
  weekly order/delivery days

### 💰 Prepaid Dealer → **Mobile / Web**
- Buys stock first, then sells to stores
- Rule: **pays first, then the distribution delivers** — the system releases
  the order only when his advance payments cover it

### 🏪 Counter Person → **Web App (Counter Sales mode)**
- Fastest screen in the system: scan/search → add → `F9` → print → next customer

## 5.3 Why mobile for the field and web for the office?

| Reason | Explanation |
|---|---|
| **Offline areas** | Malakand Division has weak signals in many territories. The mobile app saves orders on the phone and syncs later. The web app assumes good internet — which the office has |
| **Work style** | Field staff walk and ride; they need one hand and a pocket. Office staff sit at desks with keyboards and screens |
| **Battery & cost** | A lightweight Flutter app on a cheap Android phone beats carrying a laptop to Swat and back |
| **Speed where it counts** | The counter and warehouse need raw keyboard speed on a big screen — that's a web app strength |

---

# 6. The New Golden Rules (how the system protects the business)

These four rules replace trust with mathematics. Every team member should be
able to explain them:

1. **"Cache for looking, database for deciding."**
   Fast copies of balances are shown everywhere — but every *decision*
   (approving an order against a credit limit) is re-checked against the
   master database at the moment of truth. Stale copies never cause losses.

2. **"Money lives in one place."**
   All accounting lives in one rock-solid database with all-or-nothing
   transactions. An invoice either fully posts (stock + customer balance +
   accounts together) or doesn't happen at all. Half-posted invoices are
   impossible.

3. **"Nothing is overwritten — history is a ledger."**
   Stock and balances are computed from a complete movement history. When the
   count says 480 and the system says 500, we create an adjustment document
   with a reason — and the ledger *proves* how we got there.

4. **"Documents, not edits."**
   Nobody edits an invoice, ever. Wrong invoice → Void (with reason and
   permission) → correct one reissued. Partial dispute → Credit Note. The
   audit trail always tells the full story.

---

# 7. Core Workflows (Quick Reference Cards)

### 7.1 Buying: PO → Receipt
`Purchase Order` → goods arrive → `Stock Receipt` (linked to PO, actual qty +
batch + expiry) → stock up, supplier payable up, PO marked PARTIAL/RECEIVED.

### 7.2 Selling: Order → Invoice → Delivery
`Order` (booker/counter/web) → automatic checks: **credit limit** + **stock
(FEFO batch selection)** → pricing engine applies: company scheme → customer
terms → quantity discount → **bonus lines** → tax engine computes item-level
GST → `Invoice` posted in one atomic step (stock down, receivable up, accounts
posted) → van/counter delivers against the frozen batch allocation.

### 7.3 Returns
`Sales Return` linked to original invoice → each line inspected → **SALEABLE**
(back to normal stock) / **DAMAGED or EXPIRED** (quarantine) → customer balance
reduced / Credit Note issued.

### 7.4 Expiry & Claims
Weekly expiry report (30/60/90/180 days) → decision per batch → return to
company → claim money recovered ❓ (PRS) → anything unclaimed → write-off
adjustment with reason.

### 7.5 Money
Every rupee moves via a voucher: receipt from customer, payment to supplier,
expense entry. Cash book and all ledgers update instantly.

### 7.6 Field Day (Booker)
Morning: sync app, today's shops + their balances → visit shops, take orders,
collect payments (works offline all day) → evening: everything syncs, DSR is
already written by the system.

---

# 8. Migration Plan (we change without breaking the business)

1. **Same words, same flows** — staff recognize everything from day one.
2. **Excel import** — all products, batches, customers, suppliers, opening
   balances come in from the old system's data.
3. **Opening Stock Entry** — day one starts clean with a proper opening document.
4. **Parallel run (2–4 weeks)** — old system stays the official books while the
   new one runs live beside it. Daily stock + balance reports are compared.
   **We switch over only after both match 3 days in a row.**
5. **One champion user** — the person who knew the old system best sits with us
   daily during the parallel run and signs off each day.

---

# 9. Build Phases

| Phase | What ships | Who benefits first |
|---|---|---|
| **1** | Master data + import, Procurement (PO/Receipt), Stock ledger, Fresh + Counter Sales, basic Reports | Warehouse + Accountant |
| **2** | Full Accounts (vouchers, ledgers, cash book), Returns, Credit/Debit Notes, Expiry reporting | Accountant + Owner |
| **3** | **Booker Mobile App** (offline orders, credit shield, recovery, DSR) | Field team |
| **4** | **Salesman/Sub-distributor module** (van stock, virtual vault, drop-ship routing) | Independent salesmen |
| **5** | Claims ❓ (PRS), advanced dashboards, refinements from parallel-run feedback | Owner |

---

# 10. Open Questions (owner must confirm — do not build on guesses)

- [ ] What does **PRS** stand for and what is the exact paper flow?
- [ ] What is an **SPO** and their role in orders?
- [ ] Short returns: free re-delivery, credit note, or company claim?
- [ ] Credit note approval rules and value thresholds?
- [ ] Credit limit: hard block or override with reason? (counter vs field)
- [ ] Bonus stock: free from company, or do we pay for it?
- [ ] FBR/fiscal invoice numbering rules for our region?
- [ ] How many warehouses/vans/branches today?
- [ ] Sample scheme letters from top 3 companies (discount/bonus structures)?

---

# 11. One-Paragraph Summary (memorize this)

> The old system knew the business but sat on one desktop. The new system keeps
> every rule that made the old one work — batches, FEFO, bonus deals, ledgers,
> DSR — but moves it into the cloud and into everyone's pocket: the warehouse
> and accounts get a fast keyboard-driven web app, field bookers get an offline
> mobile app that protects credit limits before orders are even booked, and the
> owner sees live truth instead of month-end surprises. Stock and money are
> never silently changed — only documented — so every number can always be
> explained.
