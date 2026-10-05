import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Dashboard {
  sales: { boxesToday: number; boxesYesterday: number };
  posPaisa: {
    receivable: number;
    payable: number;
    cash: number;
    bank: number;
    absorbedTaxReceivable: number;
    expiryClaimsReceivable: number;
  };
  expiringBatches60d: number;
}

const rs = (paisa: number) => `Rs ${(paisa / 100).toLocaleString('en-PK', { minimumFractionDigits: 2 })}`;

export function Dashboard() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/reports/dashboard'),
    refetchInterval: 60_000,
  });

  if (isPending) return <section><h2>Dashboard</h2><p>Loading…</p></section>;
  if (isError) return <section><h2>Dashboard</h2><p className="error">Could not load dashboard</p></section>;

  const cards = [
    { label: 'Boxes sold today', value: String(data.sales.boxesToday), sub: `yesterday: ${data.sales.boxesYesterday}` },
    { label: 'Receivable (udhaar out)', value: rs(data.posPaisa.receivable), warn: data.posPaisa.receivable > 0 },
    { label: 'Cash', value: rs(data.posPaisa.cash) },
    { label: 'Bank', value: rs(data.posPaisa.bank) },
    { label: 'Payable (we owe)', value: rs(data.posPaisa.payable) },
    { label: 'Absorbed-tax claims (companies owe us)', value: rs(data.posPaisa.absorbedTaxReceivable), warn: data.posPaisa.absorbedTaxReceivable > 0 },
    { label: 'Expiry claims (companies owe us)', value: rs(data.posPaisa.expiryClaimsReceivable), warn: data.posPaisa.expiryClaimsReceivable > 0 },
    { label: 'Batches expiring in 60 days', value: String(data.expiringBatches60d), warn: data.expiringBatches60d > 0 },
  ];

  return (
    <section>
      <h2>Owner Dashboard</h2>
      <div className="dash-grid">
        {cards.map((c) => (
          <div key={c.label} className={`card${c.warn ? ' warn' : ''}`}>
            <div className="card-label">{c.label}</div>
            <div className="card-value">{c.value}</div>
            {c.sub && <div className="card-sub">{c.sub}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
