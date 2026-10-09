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

/** The day's summary slip — the owner's register page, one ruled sheet. */
export function Dashboard() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/reports/dashboard'),
    refetchInterval: 60_000,
  });

  return (
    <section className="sheet slip">
      <h2>Day summary</h2>
      <p className="slip-date">
        {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        {isPending && ' · updating…'}
      </p>

      {isError && <p className="error">Could not load the numbers. Check that the server is running, then refresh.</p>}
      {data && (
        <>
          <div className="slip-block">
            <div className="slip-block-title">Sold today</div>
            <div className="slip-row">
              <span className="label">Boxes sold</span>
              <span className="value">{data.sales.boxesToday}</span>
            </div>
            <div className="slip-row">
              <span className="label">
                Yesterday <small>for comparison</small>
              </span>
              <span className="value">{data.sales.boxesYesterday}</span>
            </div>
          </div>

          <div className="slip-block">
            <div className="slip-block-title">Money</div>
            <div className="slip-row">
              <span className="label">
                In cash <small>on hand at the counter</small>
              </span>
              <span className="value">{rs(data.posPaisa.cash)}</span>
            </div>
            <div className="slip-row">
              <span className="label">In bank</span>
              <span className="value">{rs(data.posPaisa.bank)}</span>
            </div>
            <div className="slip-row">
              <span className="label">
                Shops owe us <small>udhaar out</small>
              </span>
              <span className={`value${data.posPaisa.receivable > 0 ? ' due' : ''}`}>{rs(data.posPaisa.receivable)}</span>
            </div>
            <div className="slip-row">
              <span className="label">We owe companies</span>
              <span className="value">{rs(data.posPaisa.payable)}</span>
            </div>
          </div>

          <div className="slip-block">
            <div className="slip-block-title">Money coming back to us</div>
            <div className="slip-row">
              <span className="label">
                Absorbed tax claims <small>companies reimburse the tax we absorbed</small>
              </span>
              <span className={`value${data.posPaisa.absorbedTaxReceivable > 0 ? ' credited' : ''}`}>
                {rs(data.posPaisa.absorbedTaxReceivable)}
              </span>
            </div>
            <div className="slip-row">
              <span className="label">
                Expiry claims <small>returned stock awaiting company refund</small>
              </span>
              <span className={`value${data.posPaisa.expiryClaimsReceivable > 0 ? ' credited' : ''}`}>
                {rs(data.posPaisa.expiryClaimsReceivable)}
              </span>
            </div>
          </div>

          <div className="slip-block">
            <div className="slip-block-title">Watch</div>
            <div className="slip-row">
              <span className="label">
                Batches expiring within 60 days <small>sell or return them before they die</small>
              </span>
              <span className={`value${data.expiringBatches60d > 0 ? ' due' : ''}`}>{data.expiringBatches60d}</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
