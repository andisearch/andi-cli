import { afterEach, describe, expect, it } from 'vitest';
import { EXIT_CODES, resolveFormat } from '../src/output.js';

const originalIsTTY = process.stdout.isTTY;

function setTty(value: boolean): void {
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true });
}

afterEach(() => {
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
});

describe('resolveFormat', () => {
  it('auto picks markdown on a terminal and JSON when piped', () => {
    setTty(true);
    expect(resolveFormat('auto')).toBe('markdown');
    setTty(false);
    expect(resolveFormat('auto')).toBe('json');
  });

  it('defaults to auto when no format was requested', () => {
    setTty(true);
    expect(resolveFormat(undefined)).toBe('markdown');
    setTty(false);
    expect(resolveFormat(undefined)).toBe('json');
  });

  it('an explicit markdown wins over a redirected (non-TTY) stdout', () => {
    setTty(false);
    expect(resolveFormat('markdown')).toBe('markdown');
  });

  it('an explicit json wins on a terminal', () => {
    setTty(true);
    expect(resolveFormat('json')).toBe('json');
  });
});

describe('EXIT_CODES', () => {
  it('assigns each failure class a distinct code', () => {
    const values = Object.values(EXIT_CODES);
    expect(new Set(values).size).toBe(values.length);
    expect(EXIT_CODES.service_unavailable).toBe(7);
    expect(EXIT_CODES.unprocessable).toBe(8);
  });
});
