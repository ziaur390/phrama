import { useQuery } from '@tanstack/react-query';

export default function App() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('API down');
      return res.json();
    },
    refetchInterval: 30_000,
  });

  return (
    <main style={{ fontFamily: 'system-ui', padding: '4rem 2rem', maxWidth: 720, margin: '0 auto' }}>
      <h1>PHRAMA</h1>
      <p>Pharmaceutical Distribution Management System — Malakand Division</p>
      <p>
        API status:{' '}
        {health.isPending ? 'checking…' : health.isError ? '❌ down' : `✅ ${health.data.status}`}
      </p>
    </main>
  );
}
