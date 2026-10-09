import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, paisaToRupees } from '../lib/api';

interface OrderItem {
  id: number;
  productId: string;
  qty: number;
}
interface BookerOrder {
  id: number;
  number: string;
  clientRef: string;
  status: 'RECEIVED' | 'INVOICED';
  customer: { code: string; name: string } | null;
  viaCustomer: { code: string; name: string } | null;
  bookedAt: string;
  items: OrderItem[];
  invoiceId: number | null;
}

/** FR-3: the digital order queue — replaces the pile-up of paper pads. */
export function Orders() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'RECEIVED' | 'INVOICED'>('RECEIVED');
  const { data: orders = [], isPending } = useQuery({
    queryKey: ['/sync/orders', filter],
    queryFn: () => api<BookerOrder[]>(`/sync/orders?status=${filter}`),
  });
  const invoice = useMutation({
    mutationFn: (id: number) => api(`/sync/orders/${id}/invoice`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/sync/orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <section className="sheet queue">
      <h2>Order queue</h2>
      <p className="sheet-caption">Orders taken in the field, as they arrive. Generate the invoice, then dispatch against the pick list.</p>

      <div className="queue-tabs">
        {(['RECEIVED', 'INVOICED'] as const).map((s) => (
          <button key={s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>
            {s === 'RECEIVED' ? 'Waiting' : 'Invoiced'}
          </button>
        ))}
      </div>

      {isPending && <p>Loading…</p>}
      {orders.length === 0 && !isPending && (
        <p className="sheet-caption">
          {filter === 'RECEIVED'
            ? 'Nothing waiting. Orders from the bookers land here as their phones find signal.'
            : 'No invoiced orders yet.'}
        </p>
      )}

      {orders.map((o) => {
        const totalPaisa = o.items.reduce((s, i) => s + i.qty * ((i as any).product?.salePricePaisa ?? 0), 0);
        return (
          <div key={o.id} className="order-slip">
            <div className="head">
              <span className="doc-no">{o.number}</span>
              <span className="shop">{o.customer?.name ?? '?'}</span>
              {o.viaCustomer && <span className="via">via {o.viaCustomer.name} — bill him</span>}
              <span className="meta">booked {new Date(o.bookedAt).toLocaleString()}</span>
              <span className="amount">{paisaToRupees(totalPaisa)}</span>
              {o.status === 'RECEIVED' ? (
                <button className="link" disabled={invoice.isPending} onClick={() => invoice.mutate(o.id)}>
                  {invoice.isPending ? 'Generating…' : 'Generate invoice'}
                </button>
              ) : (
                <span className="done">INV-{String(o.invoiceId).padStart(6, '0')}</span>
              )}
            </div>
            <div className="lines">{o.items.map((i) => `${i.qty} × ${(i as any).product?.code ?? '?'}`).join(', ')}</div>
            {invoice.isError && <p className="error">{(invoice.error as Error).message}</p>}
          </div>
        );
      })}
    </section>
  );
}
