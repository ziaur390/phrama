import { useEffect, useState } from 'react';
import Login from './pages/Login';
import { clearSession, getUser, type AuthUser } from './lib/api';
import { Companies, Products, Customers, Territories, Warehouses, Suppliers, Users } from './pages/Masters';
import { Dashboard } from './pages/Dashboard';
import { Orders } from './pages/Orders';

interface Tab {
  id: string;
  label: string;
  comp: React.ComponentType;
  roles: string[];
}

const GROUPS: { title: string; tabs: Tab[] }[] = [
  { title: 'Today', tabs: [{ id: 'dashboard', label: 'Day summary', comp: Dashboard, roles: ['ADMIN'] }] },
  {
    title: 'Register',
    tabs: [
      { id: 'orders', label: 'Order queue', comp: Orders, roles: ['ADMIN', 'ACCOUNTANT', 'WAREHOUSE'] },
      { id: 'customers', label: 'Customers', comp: Customers, roles: ['ADMIN', 'ACCOUNTANT', 'BOOKER', 'SALESMAN'] },
    ],
  },
  {
    title: 'Catalog',
    tabs: [
      { id: 'companies', label: 'Companies', comp: Companies, roles: ['ADMIN', 'ACCOUNTANT', 'WAREHOUSE'] },
      { id: 'products', label: 'Products', comp: Products, roles: ['ADMIN', 'ACCOUNTANT', 'WAREHOUSE'] },
      { id: 'suppliers', label: 'Suppliers', comp: Suppliers, roles: ['ADMIN', 'ACCOUNTANT'] },
    ],
  },
  {
    title: 'Field',
    tabs: [
      { id: 'territories', label: 'Areas', comp: Territories, roles: ['ADMIN', 'ACCOUNTANT'] },
      { id: 'warehouses', label: 'Warehouses & vans', comp: Warehouses, roles: ['ADMIN', 'WAREHOUSE'] },
    ],
  },
  { title: 'Office', tabs: [{ id: 'users', label: 'Users', comp: Users, roles: ['ADMIN'] }] },
];

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getUser());
  const [tab, setTab] = useState<string>('dashboard');

  useEffect(() => {
    document.title = 'PHRAMA';
  }, []);

  if (!user) return <Login onLoggedIn={setUser} />;

  const visible = GROUPS.map((g) => ({ ...g, tabs: g.tabs.filter((t) => t.roles.includes(user.role)) })).filter(
    (g) => g.tabs.length > 0,
  );
  const all = visible.flatMap((g) => g.tabs);
  const active = all.find((t) => t.id === tab) ?? all[0];

  return (
    <div className="app">
      <header className="letterhead">
        <h1 className="wordmark">
          PHRAMA<span>+</span>
        </h1>
        <span className="who">
          <strong>{user.username}</strong>
          <span className="role-tag">{user.role}</span>
          <button
            className="signout link"
            onClick={() => {
              clearSession();
              setUser(null);
            }}
          >
            Sign out
          </button>
        </span>
      </header>
      <div className="frame">
        <nav className="rail" aria-label="Sections">
          {visible.map((g) => (
            <div className="rail-group" key={g.title}>
              <div className="rail-group-title">{g.title}</div>
              {g.tabs.map((t) => (
                <button key={t.id} className={t.id === active.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <main className="work">
          <active.comp />
        </main>
      </div>
    </div>
  );
}
