export interface ApiErrorBody {
  error: string;
  code?: string;
}

/** Thrown for any non-2xx response, carrying the server's `{ error, code }` envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(status: number, body: ApiErrorBody) {
    super(body.error || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
  }
}

// All calls go through the Vite dev proxy at /api (same-origin → the session cookie rides along).
const BASE = '/api';

/** A readable message when the server didn't answer with our JSON envelope (proxy/5xx pages). */
function friendlyHttpError(status: number): string {
  if (status === 502 || status === 503 || status === 504) {
    return 'The server is having a moment — try again shortly.';
  }
  return `Request failed (HTTP ${status}).`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null; // non-JSON (an HTML error page, raw text) — never surface it as the message
    }
  }
  if (!res.ok) {
    // Session expired mid-play → send the player to the door. `/me` is excluded (the session
    // provider handles its 401 as "logged out" and RequireAuth soft-redirects), as are the auth
    // pages themselves (a failed login is a normal 401, not an expiry).
    if (
      res.status === 401 &&
      path !== '/me' &&
      !window.location.pathname.startsWith('/login') &&
      !window.location.pathname.startsWith('/register')
    ) {
      window.location.assign('/login');
    }
    const errBody = (data as ApiErrorBody | null) ?? { error: friendlyHttpError(res.status) };
    throw new ApiError(res.status, errBody);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>('GET', path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body),
  del: <T>(path: string): Promise<T> => request<T>('DELETE', path),
};
