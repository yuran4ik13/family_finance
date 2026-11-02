import { createContext, useContext } from 'react';

// =========================
// API CLIENT
// One place for every request to the backend.
// - API address comes from VITE_API_URL (frontend/.env), with a local default
// - credentials: 'include' sends the httpOnly login cookie
//   (JavaScript can't read that cookie, the browser just attaches it)
// - a 401 answer means "logged out" -> the app shows the login screen
// =========================

export const API_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const UNAUTHORIZED_EVENT = 'ff:unauthorized';

// CSRF protection: the backend accepts changes only with this header.
// Other websites can't add it to requests to our API.
const CSRF_HEADERS = { 'X-Requested-With': 'family-finance' };

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);

  for (const [name, value] of Object.entries(CSRF_HEADERS)) {
    headers.set(name, value);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  return response;
}

export type CurrentUser = {
  id: number;
  email: string;
  role: 'OWNER' | 'USER' | 'DEMO';
};

// Reads the server's error message, so the user sees why it failed
export async function errorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const data = await response.json().catch(() => null);

  return typeof data?.message === 'string' ? data.message : fallback;
}

export async function fetchAuthConfig(): Promise<{
  registrationEnabled: boolean;
}> {
  const response = await fetch(`${API_URL}/api/auth/config`, {
    credentials: 'include',
  });

  if (!response.ok) {
    return { registrationEnabled: false };
  }

  return response.json();
}

export async function register(
  email: string,
  password: string,
): Promise<CurrentUser> {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...CSRF_HEADERS },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Sign up failed'));
  }

  return response.json();
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    credentials: 'include',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Failed to check login');
  }

  return response.json();
}

export async function login(
  email: string,
  password: string,
): Promise<CurrentUser> {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...CSRF_HEADERS },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Login failed'));
  }

  return response.json();
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: CSRF_HEADERS,
  });
}

type AuthContextValue = {
  user: CurrentUser;
  onLogout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthContext');
  }

  return value;
}
