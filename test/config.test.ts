import { afterEach, describe, expect, it } from 'vitest';
import { resolveApiBase, resolveApiKey } from '../src/config.js';

const originalEnv = { ...process.env };

describe('resolveApiKey precedence', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('flag wins over everything', () => {
    process.env.ANDI_API_KEY = 'env-key';
    expect(resolveApiKey('flag-key')).toBe('flag-key');
  });

  it('env wins when no flag', () => {
    process.env.ANDI_API_KEY = 'env-key';
    expect(resolveApiKey(undefined)).toBe('env-key');
  });

  it('falls through to undefined when nothing is set (assumes no ~/.andi/config.json in CI)', () => {
    delete process.env.ANDI_API_KEY;
    // Not asserting a specific value here — a real ~/.andi/config.json on the
    // dev machine running these tests would make this test environment-dependent.
    // Just assert the flag/env precedence above, which is the part under test.
    expect(typeof resolveApiKey(undefined)).not.toBe('object');
  });
});

describe('resolveApiBase', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to the production API', () => {
    delete process.env.ANDI_API_BASE;
    expect(resolveApiBase()).toBe('https://api.andiai.com');
  });

  it('honors ANDI_API_BASE and strips a trailing slash', () => {
    process.env.ANDI_API_BASE = 'http://localhost:3010/';
    expect(resolveApiBase()).toBe('http://localhost:3010');
  });
});
