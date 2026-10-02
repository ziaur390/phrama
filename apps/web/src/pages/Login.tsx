import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { saveSession, api, type AuthUser } from '../lib/api';

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export default function Login({ onLoggedIn }: { onLoggedIn: (user: AuthUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const login = useMutation({
    mutationFn: async () => {
      const res = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      // decode JWT payload (sub/username/role) — payload is base64url middle segment
      const payload = JSON.parse(atob(res.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const user: AuthUser = { userId: payload.sub, username: payload.username, role: payload.role };
      saveSession(res.accessToken, user);
      return user;
    },
    onSuccess: (user) => onLoggedIn(user),
    onError: (e: Error) => setError(e.message === 'Invalid credentials' ? 'Wrong username or password' : e.message),
  });

  return (
    <main className="login">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          login.mutate();
        }}
      >
        <h1>PHRAMA</h1>
        <p className="sub">Distribution Management System</p>
        <label>
          Username
          <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
