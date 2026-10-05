import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Login from './pages/Login';
import { api, clearSession, getUser, type AuthUser } from './lib/api';
import { Companies, Products, Customers, Territories, Warehouses, Suppliers, Users } from './pages/Masters';
import { Dashboard } from './pages/Dashboard';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', comp: Dashboard, roles: ['ADMIN'] },
  { id: 'companies', label: 'Companies', comp: Companies, roles: ['ADMIN', 'ACCOUNTANT', 'WAREHOUSE'] },
  { id: 'products', label: 'Products', comp: Products, roles: ['ADMIN', 'ACCOUNTANT', 'WAREHOUSE'] },
  { id: 'customers', label: 'Customers', comp: Customers, roles: ['ADMIN', 'ACCOUNTANT', 'BOOKER', 'SALESMAN'] },
  { id: 'territories', label: 'Territories', comp: Territories, roles: ['ADMIN', 'ACCOUNTANT'] },
  { id: 'warehouses', label: 'Warehouses', comp: Warehouses, roles: ['ADMIN', 'WAREHOUSE'] },
  { id: 'suppliers', label: 'Suppliers', comp: Suppliers, roles: ['ADMIN', 'ACCOUNTANT'] },
  { id: 'users', label: 'Users', comp: Users, roles: ['ADMIN'] },
] ;

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getUser());
  const [tab, setTab] = useState<string>('dashboard');

  useEffect(() => {
    document.title = 'PHRAMA';
  }, []);

  if (!user) return <Login onLoggedIn={setUser} />;

  const visibleTabs = TABS.filter((t) => t.roles.includes(user.role));
  const active = visibleTabs.find((t) => t.id === tab) ?? visibleTabs[0];

  return (
    <div className="app">
      <header>
        <strong>PHRAMA</strong>
        <span className="who">
          {user.username} · {user.role}
        </span>
        <button
          className="link"
          onClick={() => {
            clearSession();
            setUser(null);
          }}
        >
          Sign out
        </button>
      </header>
      <nav>
        {visibleTabs.map((t) => (
          <button key={t.id} className={t.id === active.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main>
        <active.comp />
      </main>
    </div>
  );
}
