import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, CliError } from '../src/apiClient.js';

function mockFetchOnce(status: number, body: string, headers: Record<string, string> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      status,
      ok: status >= 200 && status < 300,
      text: async () => body,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    }))
  );
}

describe('apiGet', () => {
  beforeEach(() => {
    delete process.env.ANDI_API_BASE;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws auth_required (exit 3) with no key, before making a network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(apiGet('/api/v1/search?q=x', undefined)).rejects.toMatchObject({ code: 'auth_required', exitCode: 3 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns the body text on 200', async () => {
    mockFetchOnce(200, '{"ok":true}');
    const result = await apiGet('/api/v1/search?q=x', 'key1');
    expect(result.text).toBe('{"ok":true}');
  });

  it('maps 401 to unauthorized (exit 3)', async () => {
    mockFetchOnce(401, '{"error":"Unauthorized"}');
    await expect(apiGet('/api/v1/search?q=x', 'bad-key')).rejects.toMatchObject({ code: 'unauthorized', exitCode: 3 });
  });

  it('maps 402 to payment_required (exit 4)', async () => {
    mockFetchOnce(402, '{"error":"Payment required"}');
    await expect(apiGet('/api/v1/search?q=x', 'key1')).rejects.toMatchObject({ code: 'payment_required', exitCode: 4 });
  });

  it('maps 429 to rate_limited (exit 5) and includes retry-after', async () => {
    mockFetchOnce(429, '{"error":"rate limited"}', { 'retry-after': '30' });
    await expect(apiGet('/api/v1/search?q=x', 'key1')).rejects.toMatchObject({ code: 'rate_limited', exitCode: 5 });
    try {
      await apiGet('/api/v1/search?q=x', 'key1');
    } catch (error) {
      expect((error as CliError).message).toContain('30');
    }
  });

  it('maps 400 to bad_request (exit 2)', async () => {
    mockFetchOnce(400, 'bad request body');
    await expect(apiGet('/api/v1/search?q=x', 'key1')).rejects.toMatchObject({ code: 'bad_request', exitCode: 2 });
  });

  it('maps other non-ok statuses to request_failed (exit 1)', async () => {
    mockFetchOnce(500, 'server error');
    await expect(apiGet('/api/v1/search?q=x', 'key1')).rejects.toMatchObject({ code: 'request_failed', exitCode: 1 });
  });

  it('respects ANDI_API_BASE', async () => {
    process.env.ANDI_API_BASE = 'http://localhost:3010';
    const fetchSpy = vi.fn(async () => ({
      status: 200,
      ok: true,
      text: async () => 'ok',
      headers: { get: () => null },
    }));
    vi.stubGlobal('fetch', fetchSpy);
    await apiGet('/api/v1/search?q=x', 'key1');
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3010/api/v1/search?q=x', expect.any(Object));
  });
});
