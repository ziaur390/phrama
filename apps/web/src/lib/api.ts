// Shared helpers for API access + auth token storage.

const TOKEN_KEY = 'phrama.token';
const USER_KEY = 'phrama.user';

export interface AuthUser {
  userId: string;
  username: string;
  role: 'ADMIN' | 'ACCOUNTANT' | 'WAREHOUSE' | 'BOOKER' | 'SALESMAN' | 'COUNTER';
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function saveSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearSession();
    if (location.pathname !== '/login') location.href = '/login';
    throw new ApiError(401, 'Session expired');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.message ?? res.statusText);
  return body as T;
}

/** Money is integer paisa in the DB; format for display as PKR rupees. */
export function paisaToRupees(paisa: number): string {
  return (paisa / 100).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
