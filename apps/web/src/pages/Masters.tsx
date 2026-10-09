import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, paisaToRupees, getUser, type AuthUser } from '../lib/api';

// ─── types (mirror API) ───
export interface Company {
  id: string;
  code: string;
  name: string;
  taxPolicies: { id: string; policy: 'ABSORB' | 'STRICT'; effectiveFrom: string }[];
}
export interface Product {
  id: string;
  code: string;
  name: string;
  pack?: string;
  salePricePaisa: number;
  active: boolean;
  company: { code: string; name: string };
}
export interface Customer {
  id: string;
  code: string;
  name: string;
  type: 'REGULAR' | 'SALESMAN' | 'PREPAID';
  filerStatus: 'FILER' | 'NON_FILER';
  creditLimitPaisa: number;
  openingBalancePaisa: number;
  active: boolean;
  territory?: { name: string } | null;
}
export interface Territory {
  id: string;
  name: string;
  orderDay?: number | null;
  deliveryDay?: number | null;
}
export interface Warehouse {
  id: string;
  name: string;
  kind: 'MAIN' | 'VAN' | 'QUARANTINE';
}
export interface Supplier {
  id: string;
  company: { code: string; name: string };
}
export interface User {
  id: string;
  username: string;
  fullName: string;
  role: string;
  active: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── generic table shell ───
export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table>
      <thead>
        <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

// ─── Companies ───
export function Companies() {
  const qc = useQueryClient();
  const { data: companies } = useQuery({ queryKey: ['companies'], queryFn: () => api<Company[]>('/companies') });
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [policy, setPolicy] = useState<'ABSORB' | 'STRICT'>('ABSORB');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));

  const create = useMutation({
    mutationFn: () => api('/companies', { method: 'POST', body: JSON.stringify({ code, name }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  });
  const setPolicyMut = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api(`/companies/${id}/tax-policy`, { method: 'POST', body: JSON.stringify({ policy, effectiveFrom }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  });

  return (
    <section>
      <h2>Companies</h2>
      <p className="sheet-caption">The manufacturers. Their tax policy decides per invoice line whether the store pays the tax or the company absorbs it.</p>
      <Table head={['Code', 'Name', 'Tax policy (current)']}>
        {(companies ?? []).map((c) => {
          const current = [...c.taxPolicies].sort(
            (a, b) => +new Date(b.effectiveFrom) - +new Date(a.effectiveFrom),
          )[0];
          return (
            <tr key={c.id}>
              <td>{c.code}</td>
              <td>{c.name}</td>
              <td>
                {current ? `${current.policy} since ${current.effectiveFrom.slice(0, 10)}` : '—'}
                <button
                  className="link"
                  title={`Set ${policy} from ${effectiveFrom}`}
                  onClick={() => setPolicyMut.mutate({ id: c.id })}
                >
                  Set {policy} from {effectiveFrom}
                </button>
              </td>
            </tr>
          );
        })}
      </Table>
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
          setCode('');
          setName('');
        }}
      >
        <input placeholder="Code (e.g. GSK)" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <select value={policy} onChange={(e) => setPolicy(e.target.value as 'ABSORB' | 'STRICT')}>
          <option value="ABSORB">ABSORB</option>
          <option value="STRICT">STRICT</option>
        </select>
        <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        <button disabled={create.isPending}>Add company</button>
      </form>
      {create.isError && <p className="error">{(create.error as Error).message}</p>}
    </section>
  );
}

// ─── Products ───
export function Products() {
  const qc = useQueryClient();
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/products') });
  const { data: companies } = useQuery({ queryKey: ['companies'], queryFn: () => api<Company[]>('/companies') });
  const [f, setF] = useState({ code: '', name: '', companyId: '', pack: '', priceRupees: '' });

  const create = useMutation({
    mutationFn: () =>
      api('/products', {
        method: 'POST',
        body: JSON.stringify({
          code: f.code,
          name: f.name,
          companyId: f.companyId,
          pack: f.pack || undefined,
          salePricePaisa: Math.round(Number(f.priceRupees) * 100),
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  return (
    <section>
      <h2>Products</h2>
      <p className="sheet-caption">Same codes as the old order pads, so staff recognize every item.</p>
      <Table head={['Code', 'Name', 'Company', 'Pack', 'Sale price (Rs)']}>
        {(products ?? []).map((p) => (
          <tr key={p.id}>
            <td>{p.code}</td>
            <td>{p.name}</td>
            <td>{p.company.code}</td>
            <td>{p.pack ?? '—'}</td>
            <td>{paisaToRupees(p.salePricePaisa)}</td>
          </tr>
        ))}
      </Table>
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input placeholder="Code (old ERP ID)" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required />
        <input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <select value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })} required>
          <option value="">Company…</option>
          {(companies ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
        <input placeholder="Pack" value={f.pack} onChange={(e) => setF({ ...f, pack: e.target.value })} />
        <input placeholder="Sale price Rs" type="number" step="0.01" value={f.priceRupees} onChange={(e) => setF({ ...f, priceRupees: e.target.value })} required />
        <button disabled={create.isPending}>Add product</button>
      </form>
      {create.isError && <p className="error">{(create.error as Error).message}</p>}
    </section>
  );
}

// ─── Customers ───
export function Customers() {
  const qc = useQueryClient();
  const user = getUser();
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: () => api<Customer[]>('/customers') });
  const { data: territories } = useQuery({ queryKey: ['territories'], queryFn: () => api<Territory[]>('/territories') });
  const { data: salesmen } = useQuery({
    queryKey: ['salesmen'],
    queryFn: () => api<Customer[]>('/customers').then((all) => all.filter((c) => c.type === 'SALESMAN')),
  });
  const [f, setF] = useState({ code: '', name: '', type: 'REGULAR', filerStatus: 'NON_FILER', creditLimitRupees: '', territoryId: '', salesmanId: '' });

  const create = useMutation({
    mutationFn: () =>
      api('/customers', {
        method: 'POST',
        body: JSON.stringify({
          code: f.code,
          name: f.name,
          type: f.type,
          filerStatus: f.filerStatus,
          creditLimitPaisa: f.creditLimitRupees ? Math.round(Number(f.creditLimitRupees) * 100) : undefined,
          territoryId: f.territoryId || undefined,
          salesmanId: f.salesmanId || undefined,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });

  const setFiler = useMutation({
    mutationFn: ({ id, filerStatus }: { id: string; filerStatus: string }) =>
      api(`/customers/${id}/filer-status`, {
        method: 'POST',
        body: JSON.stringify({ filerStatus, reason: `Admin ${user?.username} changed filer status via UI` }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });

  return (
    <section>
      <h2>Customers</h2>
      <p className="sheet-caption">The medical stores. Filer status is admin-only and audit-logged; it sets the tax rate on their invoices.</p>
      <Table head={['Code', 'Name', 'Type', 'Filer status', 'Credit limit (Rs)', 'Territory', 'Salesman']}>
        {(customers ?? []).map((c) => (
          <tr key={c.id}>
            <td>{c.code}</td>
            <td>{c.name}</td>
            <td>{c.type}</td>
            <td>
              {user?.role === 'ADMIN' ? (
                <button
                  className="link"
                  onClick={() =>
                    setFiler.mutate({ id: c.id, filerStatus: c.filerStatus === 'FILER' ? 'NON_FILER' : 'FILER' })
                  }
                  title="Admin-only, audit-logged"
                >
                  {c.filerStatus}
                </button>
              ) : (
                c.filerStatus
              )}
            </td>
            <td>{c.creditLimitPaisa ? paisaToRupees(c.creditLimitPaisa) : '—'}</td>
            <td>{c.territory?.name ?? '—'}</td>
            <td>
              {customers?.find((s) => s.id === (c as any).salesmanId)?.name ?? '—'}
            </td>
          </tr>
        ))}
      </Table>
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input placeholder="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required />
        <input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="REGULAR">REGULAR</option>
          <option value="SALESMAN">SALESMAN</option>
          <option value="PREPAID">PREPAID</option>
        </select>
        <select value={f.filerStatus} onChange={(e) => setF({ ...f, filerStatus: e.target.value })}>
          <option value="NON_FILER">NON-FILER</option>
          <option value="FILER">FILER</option>
        </select>
        <input placeholder="Credit limit Rs" type="number" value={f.creditLimitRupees} onChange={(e) => setF({ ...f, creditLimitRupees: e.target.value })} />
        <select value={f.territoryId} onChange={(e) => setF({ ...f, territoryId: e.target.value })}>
          <option value="">Territory…</option>
          {(territories ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={f.salesmanId} onChange={(e) => setF({ ...f, salesmanId: e.target.value })}>
          <option value="">Salesman…</option>
          {(salesmen ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button disabled={create.isPending}>Add customer</button>
      </form>
      {create.isError && <p className="error">{(create.error as Error).message}</p>}
    </section>
  );
}

// ─── Territories ───
export function Territories() {
  const qc = useQueryClient();
  const { data: territories } = useQuery({ queryKey: ['territories'], queryFn: () => api<Territory[]>('/territories') });
  const [f, setF] = useState({ name: '', orderDay: '1', deliveryDay: '2' });

  const create = useMutation({
    mutationFn: () =>
      api('/territories', {
        method: 'POST',
        body: JSON.stringify({ name: f.name, orderDay: Number(f.orderDay), deliveryDay: Number(f.deliveryDay) }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['territories'] }),
  });

  return (
    <section>
      <h2>Areas</h2>
      <p className="sheet-caption">Each area has its own weekly order day and delivery day; the booker app shows today's areas.</p>
      <Table head={['Name', 'Order day', 'Delivery day']}>
        {(territories ?? []).map((t) => (
          <tr key={t.id}>
            <td>{t.name}</td>
            <td>{t.orderDay != null ? DAYS[t.orderDay] : '—'}</td>
            <td>{t.deliveryDay != null ? DAYS[t.deliveryDay] : '—'}</td>
          </tr>
        ))}
      </Table>
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input placeholder="Name (e.g. Madain)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <select value={f.orderDay} onChange={(e) => setF({ ...f, orderDay: e.target.value })}>
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <select value={f.deliveryDay} onChange={(e) => setF({ ...f, deliveryDay: e.target.value })}>
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <button disabled={create.isPending}>Add territory</button>
      </form>
      {create.isError && <p className="error">{(create.error as Error).message}</p>}
    </section>
  );
}

// ─── Warehouses ───
export function Warehouses() {
  const qc = useQueryClient();
  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/warehouses') });
  const [f, setF] = useState({ name: '', kind: 'VAN' });

  const create = useMutation({
    mutationFn: () => api('/warehouses', { method: 'POST', body: JSON.stringify(f) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }),
  });

  return (
    <section>
      <h2>Warehouses & vans</h2>
      <p className="sheet-caption">Where stock sits: the main warehouse, vans on the road, and quarantine for goods that must never be resold.</p>
      <Table head={['Name', 'Kind']}>
        {(warehouses ?? []).map((w) => (
          <tr key={w.id}>
            <td>{w.name}</td>
            <td>{w.kind}</td>
          </tr>
        ))}
      </Table>
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input placeholder="Name (e.g. Van — Timergara)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          <option value="MAIN">MAIN</option>
          <option value="VAN">VAN</option>
          <option value="QUARANTINE">QUARANTINE</option>
        </select>
        <button disabled={create.isPending}>Add</button>
      </form>
      {create.isError && <p className="error">{(create.error as Error).message}</p>}
    </section>
  );
}

// ─── Suppliers ───
export function Suppliers() {
  const qc = useQueryClient();
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => api<Supplier[]>('/suppliers') });
  const { data: companies } = useQuery({ queryKey: ['companies'], queryFn: () => api<Company[]>('/companies') });
  const [companyId, setCompanyId] = useState('');

  const create = useMutation({
    mutationFn: () => api('/suppliers', { method: 'POST', body: JSON.stringify({ companyId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  return (
    <section>
      <h2>Suppliers</h2>
      <p className="sheet-caption">The companies you buy from; purchase orders and payables are tracked against them.</p>
      <Table head={['Company code', 'Company name']}>
        {(suppliers ?? []).map((s) => (
          <tr key={s.id}>
            <td>{s.company.code}</td>
            <td>{s.company.name}</td>
          </tr>
        ))}
      </Table>
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} required>
          <option value="">Company…</option>
          {(companies ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
        <button disabled={create.isPending}>Add supplier</button>
      </form>
      {create.isError && <p className="error">{(create.error as Error).message}</p>}
    </section>
  );
}

// ─── Users (admin only) ───
export function Users() {
  const qc = useQueryClient();
  const { data: users, error } = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/users') });
  const [f, setF] = useState({ username: '', password: '', fullName: '', role: 'BOOKER' });

  const create = useMutation({
    mutationFn: () => api('/users', { method: 'POST', body: JSON.stringify(f) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <section>
      <h2>Users</h2>
      <p className="sheet-caption">Everyone gets only what their role needs. Passwords need at least 8 characters.</p>
      {error && <p className="error">{(error as Error).message}</p>}
      <Table head={['Username', 'Full name', 'Role', 'Active']}>
        {(users ?? []).map((u) => (
          <tr key={u.id}>
            <td>{u.username}</td>
            <td>{u.fullName}</td>
            <td>{u.role}</td>
            <td>{u.active ? 'yes' : 'no'}</td>
          </tr>
        ))}
      </Table>
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input placeholder="Username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required />
        <input placeholder="Password (min 8)" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
        <input placeholder="Full name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required />
        <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          {['ADMIN', 'ACCOUNTANT', 'WAREHOUSE', 'BOOKER', 'SALESMAN', 'COUNTER'].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <button disabled={create.isPending}>Add user</button>
      </form>
      {create.isError && <p className="error">{(create.error as Error).message}</p>}
    </section>
  );
}
