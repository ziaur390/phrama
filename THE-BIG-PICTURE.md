# THE BIG PICTURE
## The Whole System Explained as One Story
### Read this top-to-bottom once, and you understand the entire project.

---

## 1. The Business in One Breath

Our client is a **middleman**. They buy medicine in bulk from big
manufacturers (GSK, Abbott, Getz...), store it in a warehouse, and sell it to
hundreds of small medical shops across Malakand Division.

That is the entire business. Everything else is managing three things:

- **GOODS** — what came in, what's in stock, what expires when
- **MONEY** — who owes us, whom we owe, what we earned
- **PEOPLE** — bookers in the field, warehouse staff, accountant, counter, owner

The old desktop system + paper registers manage these three things badly.
The new system manages them completely, from anywhere, with zero paper.

---

## 2. Follow One Box of Medicine — the Whole Business in 6 Steps

### Step 1 — Arrival
1,000 boxes of Panadol arrive from GSK. Every box belongs to a **batch**
with a batch number and an **expiry date**.
- **Today:** written in a register. **New system:** a *Stock Receipt* document,
  linked to the Purchase Order. Stock, supplier payable, and accounts update
  in one shot.

### Step 2 — Sitting in the Warehouse (medicine dies)
Medicine **expires**. So the batch that expires first must sell first
(**FEFO — First-Expiry-First-Out**).
- **Today:** staff guess from memory/notes; wrong guesses = expired stock =
  thrown-away money. **New system:** the computer always picks the correct
  batch automatically. A weekly report warns about everything expiring in
  30/60/90/180 days — **before** it dies.

### Step 3 — Ordering (the paper pad problem)
A **booker** visits 15 shops a day. Shops order on credit ("udhaar").
- **Today:** he writes orders on paper, brings them at night, the office
  **retypes** them. Slow. Wrong. The shop ordered what's already out of stock
  and nobody knew until tomorrow.
- **New system:** he enters the order on his **phone** — with **no internet
  needed**. It checks live stock and the shop's balance, saves itself, and
  sends automatically when signal returns. The warehouse sees it in minutes,
  not tomorrow.

### Step 4 — The Danger Moment (the credit shield)
A shop owes Rs. 480,000. Its credit limit is Rs. 500,000. The booker books
Rs. 40,000 more because he doesn't know. Goods go out. The shop can't pay.
**Money lost.**
- **Today:** this happens constantly — paper knows nothing.
- **New system:** the app **stops (or flags) the order on the spot**, before
  it reaches the warehouse. This one feature saves real money every week.

### Step 5 — Money Comes Back
Shops pay 15–60 days later. Recovery must be recorded against the right shop.
- **Today:** handwritten register, forgotten entries, arguments.
- **New system:** booker records the payment in the app (or counter takes it).
  The customer ledger updates itself everywhere. The owner sees today's
  recoveries live.

### Step 6 — Death of the Medicine (claims)
Boxes expiring soon should go **back to the manufacturer for a refund — a
claim** (❓ the "PRS" cycle, owner must confirm details).
- **Today:** claims tracked on papers; papers get lost; **money is never
  recovered.**
- **New system:** expiry report → return document → claim record per company →
  tracked until the money comes back. No claim forgotten.

**If you understand these 6 steps, you understand 90% of the system.**

---

## 3. The One Idea Behind the Whole System

> **Every physical action — goods arriving, goods leaving, money moving,
> goods returning — becomes a digital document instantly, and all the math
> (stock, balances, accounts, reports) updates itself.**
>
> **Nobody retypes anything. Nobody keeps a register. Nothing is silently
> changed — everything is a document with a reason.**

The web app, the mobile app, the database — these are just the tools that
make that sentence true.

---

## 4. Who Gets What, and Why

| Person | Today (paper) | Gets | Why |
|---|---|---|---|
| **Booker (field)** | Paper order pad, no stock/balance info | **Mobile app, offline-first** | Malakand has dead zones; must work without internet. Also gets the **credit shield** and shop history in his pocket |
| **Warehouse staff** | Registers, double entry, guessing batches | **Web app, keyboard-fast** | Receive goods once; the system *tells* him which batch to pick (FEFO). No thinking, no mistakes |
| **Accountant** | Handwritten ledgers and vouchers | **Web app** | Every voucher auto-posts to the right ledger. Month-end = minutes |
| **Counter person** | Handwritten cash invoices | **Web app, hotkeys** (F2 search → Enter add → F9 pay & print) | Walk-in served in under a minute, no mouse |
| **Owner** | Learns truth at month-end, via arguments | **Web dashboard** | Live sales, receivables, cash, expiring stock — problems visible **while fixable** |
| **Independent salesman / sub-distributor** | Buys our stock, resells in his area, own register | **Mobile app with his own van-stock "vault"** | His stock, his customers, his ledger — and when delivery routes through our main van, ownership and accounts switch automatically |

**Why mobile for the field and web for the office:**
the field walks and rides with weak signals → offline mobile app on cheap
Android phones. The office sits at desks with power and internet → fast
keyboard-driven web app on big screens.

---

## 5. The Paper Funeral (every paper → what kills it)

| Paper today | Killed by |
|---|---|
| Booker's order pad | Mobile order (offline-capable) |
| Office retyping of orders | Orders arrive digitally, pre-checked |
| Stock register | Stock ledger — updates itself on every movement |
| "Memory" credit limits | Automatic block/warning at order time |
| Customer udhaar register | Auto-updated customer ledger, visible in the field |
| Expiry notebook | Weekly auto-report (30/60/90/180 days) |
| Claims papers with companies | Digital claim records per company, tracked to recovery |
| Hand-written DSR | Generated automatically from what bookers already typed |
| Hand-edited invoices | Invoices frozen forever; corrections = Void / Credit Note with reason |
| Daily cash book | Auto cash book from every voucher |

**Goal: the only paper left in the business is the printed invoice the
customer keeps.**

---

## 6. What They REALLY Need (build priority order)

1. **Booker mobile app: offline orders + credit shield** — kills the worst
   paper and the worst money losses
2. **Stock ledger + FEFO picking** — stock always true, expiry losses shrink
3. **Automatic accounts** — ledgers, vouchers, cash book write themselves
4. **Expiry + claims tracking** — money recovered from companies instead of rotting
5. **Owner dashboard** — live truth instead of month-end surprises

Everything else (payroll, BI, portals) is later.

---

## 7. The Four Safety Rules (why the new system can be trusted)

1. **"Cache for looking, database for deciding."** Fast copies of balances
   are fine for display — but every *decision* (approve an order against a
   credit limit) re-checks the master database at the moment of truth.
2. **"Money has one home."** All accounting in one rock-solid database with
   all-or-nothing transactions. An invoice fully posts — stock + balance +
   accounts together — or it doesn't happen. Half-posted invoices are impossible.
3. **"Nothing is overwritten."** Stock and balances come from a complete
   history. Count says 480, system says 500? An adjustment document with a
   reason is created — the history *proves* every number.
4. **"Documents, not edits."** Nobody edits an invoice, ever. Wrong invoice →
   Void (with reason + permission) → correct one issued. Full audit trail.

---

## 8. The System Map (one picture)

```
                    ┌─────────────────────────────┐
                    │   CENTRAL BRAIN (cloud)      │
                    │   One database = one truth   │
                    │   Stock · Money · Documents  │
                    └──────┬───────────────┬──────┘
                           │               │
              WEB APP (office)       MOBILE APPS (field)
              ├ Owner dashboard      ├ Booker: offline orders,
              ├ Accountant: ledgers, │   credit shield, recovery
              │   vouchers, reports  ├ Salesman: van stock vault,
              ├ Warehouse: receive,  │   own customers & ledger
              │   pick (FEFO), move  └ Works with NO internet —
              └ Counter: hotkey cash    syncs when signal returns
                  sales (F2/Enter/F9)

  COMPANIES (GSK, Abbott...)          CUSTOMERS (medical shops)
        ↑ purchases & claims                ↑ orders & payments
        └──────────── ALL CONNECTED TO THE ONE BRAIN ────────────┘
```

Every arrow is a **document**. Every document updates **stock + money +
reports** at the same instant. That is the whole system.

---

## 9. One-Paragraph Summary (say this to anyone who asks)

> They are a medicine wholesaler: buy from big companies, sell to small shops
> on credit, across an area with weak internet. Today everything runs on paper
> and one desktop — orders get retyped, credit limits are guessed, stock
> numbers go wrong, expiring medicine is discovered too late, and money
> promised by companies for expired stock is lost in paper claims.
>
> We replace every paper with one digital document that instantly updates
> stock, customer balances, accounts, and reports. Field bookers get a mobile
> app that works offline and stops orders that would cross a shop's credit
> limit. The warehouse gets a fast web app that always picks the right batch.
> The accountant's ledgers write themselves. The owner sees live truth. The
> only paper left is the invoice in the customer's hand.
