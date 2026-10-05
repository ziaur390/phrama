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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/sync/orders'] }),
  });

  return (
    <section>
      <h2>Booker Order Queue</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['RECEIVED', 'INVOICED'] as const).map((s) => (
          <button key={s} className={filter === s ? 'tab active' : 'tab'} onClick={() => setFilter(s)}>
            {s}
          </button>
        ))}
      </div>
      {isPending && <p>Loading…</p>}
      {orders.length === 0 && !isPending && <p>No {filter.toLowerCase()} orders.</p>}
      {orders.map((o) => {
        const totalPaisa = o.items.reduce((s, i) => s + i.qty * ((i as any).product?.salePricePaisa ?? 0), 0);
        return (
          <div key={o.id} style={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 10, padding: '0.8rem 1rem', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <strong>{o.number}</strong>
              <span>{o.customer?.name ?? "?"}</span>
              {o.viaCustomer && (
                <span style={{ color: '#0a7d32', fontWeight: 600 }}>via {o.viaCustomer.name} — billed to him</span>
              )}
              <span style={{ color: '#a8a29e', fontSize: 12 }}>
                booked {new Date(o.bookedAt).toLocaleString()}
              </span>
              <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{paisaToRupees(totalPaisa)}</span>
              {o.status === 'RECEIVED' ? (
                <button className="link" disabled={invoice.isPending} onClick={() => invoice.mutate(o.id)}>
                  {invoice.isPending ? 'Generating…' : 'Generate invoice'}
                </button>
              ) : (
                <span style={{ color: '#0a7d32', fontSize: 12 }}>INV-{String(o.invoiceId).padStart(6, '0')}</span>
              )}
            </div>
            <div style={{ fontSize: 13, color: '#57534e', marginTop: 4 }}>
              {o.items.map((i) => `${i.qty} × ${(i as any).product?.code ?? i.productId}`).join(', ')}
            </div>
            {invoice.isError && <p className="error">{(invoice.error as Error).message}</p>}
          </div>
        );
      })}
    </section>
  );
}
