import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface CatalogItem {
  id: string;
  code: string;
  name: string;
  companyCode: string;
  pack: string | null;
  salePricePaisa: number;
  stockInMain: number;
}
interface InvoiceResponse {
  id: number;
  number: string;
  date: string;
  items: {
    qty: number;
    unitPricePaisa: number;
    discountPct: number;
    isBonus: boolean;
    taxChargedPaisa: number;
    taxAbsorbedPaisa: number;
    product: { code: string; name: string };
    batch: { batchNo: string; expiry: string };
  }[];
}

const rs = (paisa: number) => `Rs ${(paisa / 100).toLocaleString('en-PK', { minimumFractionDigits: 2 })}`;

/** The fastest screen in the system: F2 search, Enter add, F9 pay & print. */
export function Counter() {
  const { data: pull, refetch } = useQuery({
    queryKey: ['counter-catalog'],
    queryFn: () => api<{ catalog: CatalogItem[]; customers: { id: string; code: string }[] }>('/sync/pull'),
  });
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api<{ id: string; kind: string }[]>('/warehouses'),
  });
  const mainWarehouseId = warehouses?.find((w) => w.kind === 'MAIN')?.id ?? null;

  const walkin = useMemo(
    () => pull?.customers.find((c) => c.code === 'WALKIN')?.id ?? null,
    [pull],
  );

  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<{ product: CatalogItem; qty: number }[]>([]);
  const [invoice, setInvoice] = useState<InvoiceResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // ── hotkeys ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setInvoice(null);
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === 'F9') {
        e.preventDefault();
        payAndPrint();
      } else if (e.key === 'Escape') {
        setSearch('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !pull) return [];
    return pull.catalog
      .filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [search, pull]);

  const addLine = (p: CatalogItem) => {
    setLines((cur) => {
      const existing = cur.find((l) => l.product.id === p.id);
      if (existing) return cur.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...cur, { product: p, qty: 1 }];
    });
    setSearch('');
    searchRef.current?.focus();
  };

  const onSearchEnter = () => {
    if (matches[0]) addLine(matches[0]);
  };

  const total = lines.reduce((s, l) => s + l.qty * l.product.salePricePaisa, 0);
  const stockOf = (id: string) => lines.find((l) => l.product.id === id)?.product.stockInMain ?? 0;

  async function payAndPrint() {
    if (!lines.length || !walkin || !mainWarehouseId || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api<InvoiceResponse>('/sales/invoices', {
        method: 'POST',
        body: JSON.stringify({
          customerId: walkin,
          warehouseId: mainWarehouseId,
          channel: 'COUNTER',
          items: lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
        }),
      });
      setInvoice(res);
      setLines([]);
      refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sheet counter">
      <h2>Counter sale</h2>
      <p className="sheet-caption">Walk-in sale, cash on the counter. F2 to search, Enter to add, F9 to take payment and print.</p>

      <div className="counter-search">
        <input
          ref={searchRef}
          placeholder="F2 · type a code or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearchEnter()}
          aria-label="Search products"
        />
        {matches.length > 0 && (
          <ul className="suggest">
            {matches.map((m) => (
              <li key={m.id}>
                <button onClick={() => addLine(m)}>
                  <strong>{m.code}</strong> {m.name}
                  <span className="meta">
                    {m.companyCode} · {rs(m.salePricePaisa)} · {m.stockInMain} in stock
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lines.length > 0 && (
        <table className="bill">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Qty</th>
              <th className="num">Rate</th>
              <th className="num">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.product.id}>
                <td>
                  <strong>{l.product.code}</strong> {l.product.name}
                </td>
                <td className="num">
                  <input
                    className="qty"
                    type="number"
                    min={1}
                    value={l.qty}
                    onChange={(e) =>
                      setLines((cur) =>
                        cur.map((x) => (x.product.id === l.product.id ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)),
                      )
                    }
                    aria-label={`Quantity for ${l.product.code}`}
                  />
                </td>
                <td className="num">{rs(l.product.salePricePaisa)}</td>
                <td className="num">{rs(l.qty * l.product.salePricePaisa)}</td>
                <td className="num">
                  <button className="link" onClick={() => setLines((cur) => cur.filter((x) => x.product.id !== l.product.id))}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {lines.length === 0 && !invoice && <p className="empty">No items yet. Press F2 and type the medicine code — the pad fills as you go.</p>}

      {lines.length > 0 && (
        <div className="counter-total">
          <span className="label">Amount due</span>
          <span className="value">{rs(total)}</span>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="hotkeys">
        <span>
          <kbd>F2</kbd> search
        </span>
        <span>
          <kbd>Enter</kbd> add line
        </span>
        <span>
          <kbd>F9</kbd> pay & print
        </span>
        <span>
          <kbd>Esc</kbd> clear search
        </span>
      </div>

      {invoice && <PrintInvoice invoice={invoice} />}
    </section>
  );
}

/** The printed paper — the only physical document the system produces. */
function PrintInvoice({ invoice }: { invoice: InvoiceResponse }) {
  const net = invoice.items.reduce((s, i) => s + i.qty * Math.round(i.unitPricePaisa * (1 - i.discountPct / 100)), 0);
  const charged = invoice.items.reduce((s, i) => s + i.taxChargedPaisa, 0);
  const absorbed = invoice.items.reduce((s, i) => s + i.taxAbsorbedPaisa, 0);

  return (
    <div className="print-sheet" aria-label={`Invoice ${invoice.number} ready to print`}>
      <div className="print-head">
        <div>
          <strong className="wm">
            PHRAMA<span>+</span>
          </strong>
          <div className="sub">Wholesale medicine distribution — Malakand Division</div>
        </div>
        <div className="doc">
          <div className="no">{invoice.number}</div>
          <div className="date">{new Date(invoice.date).toLocaleString()}</div>
          <div className="tag">Counter sale · cash</div>
        </div>
      </div>

      <table className="print-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Item</th>
            <th>Batch</th>
            <th>Expiry</th>
            <th className="num">Qty</th>
            <th className="num">Rate</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((i, k) => (
            <tr key={k}>
              <td>{i.product.code}</td>
              <td>
                {i.product.name}
                {i.isBonus && <em> (free)</em>}
              </td>
              <td>{i.batch.batchNo}</td>
              <td>{i.batch.expiry.slice(0, 10)}</td>
              <td className="num">{i.qty}</td>
              <td className="num">{i.isBonus ? 'FREE' : rs(i.unitPricePaisa)}</td>
              <td className="num">{i.isBonus ? 'FREE' : rs(i.qty * Math.round(i.unitPricePaisa * (1 - i.discountPct / 100)))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="print-totals">
        <div className="row">
          <span>Subtotal</span>
          <span>{rs(net)}</span>
        </div>
        <div className="row tax">
          <span>GST charged (on strict-company items)</span>
          <span>{rs(charged)}</span>
        </div>
        {absorbed > 0 && (
          <div className="row note">
            <span>Tax absorbed by company on this bill</span>
            <span>{rs(absorbed)}</span>
          </div>
        )}
        <div className="row grand">
          <span>Total payable</span>
          <span>{rs(net + charged)}</span>
        </div>
      </div>

      <div className="print-foot">Goods once sold are returned only with this invoice. Thank you.</div>
    </div>
  );
}
