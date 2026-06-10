/**
 * The web test seed (audit §11): behavior tests for the API client — error-envelope shaping,
 * friendly non-JSON fallbacks, and the 401 session-expiry redirect with its exclusions.
 * Node environment; `fetch` and `window` are stubbed (client.ts touches window only on 401).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './client.js';

function stubFetch(status: number, body: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: status < 400, status, text: async () => body })),
  );
}

function stubWindow(pathname: string): ReturnType<typeof vi.fn> {
  const assign = vi.fn();
  vi.stubGlobal('window', { location: { pathname, assign } });
  return assign;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('returns parsed JSON on success', async () => {
    stubFetch(200, JSON.stringify({ status: 'ok', cubes: 42 }));
    await expect(api.get('/me')).resolves.toEqual({ status: 'ok', cubes: 42 });
  });

  it('throws ApiError carrying the server envelope', async () => {
    stubWindow('/');
    stubFetch(409, JSON.stringify({ error: 'username taken', code: 'taken' }));
    const err = await api.post('/auth/register', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('username taken');
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).code).toBe('taken');
  });

  it('never surfaces raw non-JSON bodies — 502 reads friendly', async () => {
    stubWindow('/');
    stubFetch(502, '<!DOCTYPE html><html>Bad Gateway</html>');
    const err = await api.get('/care').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('The server is having a moment — try again shortly.');
    expect((err as ApiError).message).not.toContain('<');
  });

  it('redirects to /login on a 401 mid-play', async () => {
    const assign = stubWindow('/care');
    stubFetch(401, JSON.stringify({ error: 'unauthorized' }));
    await expect(api.post('/care/groom')).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('does NOT redirect for the /me bootstrap (the session provider owns that 401)', async () => {
    const assign = stubWindow('/');
    stubFetch(401, JSON.stringify({ error: 'unauthorized' }));
    await expect(api.get('/me')).rejects.toBeInstanceOf(ApiError);
    expect(assign).not.toHaveBeenCalled();
  });

  it('does NOT redirect from the auth pages (a failed login is a normal 401)', async () => {
    const assign = stubWindow('/login');
    stubFetch(401, JSON.stringify({ error: 'wrong password' }));
    await expect(api.post('/auth/login', {})).rejects.toBeInstanceOf(ApiError);
    expect(assign).not.toHaveBeenCalled();
  });
});
