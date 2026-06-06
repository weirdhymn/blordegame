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
      data = { error: text };
    }
  }
  if (!res.ok) {
    const errBody = (data as ApiErrorBody | null) ?? { error: `HTTP ${res.status}` };
    throw new ApiError(res.status, errBody);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>('GET', path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body),
  del: <T>(path: string): Promise<T> => request<T>('DELETE', path),
};
