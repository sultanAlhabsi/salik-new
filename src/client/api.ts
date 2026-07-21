import type { CurrentUser } from './types';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = payload.error;
    throw new ApiError(response.status, error?.message ?? 'Request failed', error?.code);
  }
  return payload as T;
}

export async function login(email: string, password: string) {
  return api<{ user: CurrentUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function logout() {
  return api<{ ok: true }>('/auth/logout', { method: 'POST' });
}

export async function me() {
  return api<{ user: CurrentUser }>('/auth/me');
}
