/**
 * Config resolution — API base URL and API key.
 *
 * Auth precedence: --api-key flag > ANDI_API_KEY env > ~/.andi/config.json > none.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_API_BASE = 'https://api.andiai.com';

export function resolveApiBase(): string {
  return (process.env.ANDI_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
}

interface AndiConfigFile {
  apiKey?: string;
}

function readConfigFile(): AndiConfigFile {
  try {
    const raw = readFileSync(join(homedir(), '.andi', 'config.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveApiKey(flagKey?: string): string | undefined {
  if (flagKey) return flagKey;
  if (process.env.ANDI_API_KEY) return process.env.ANDI_API_KEY;
  return readConfigFile().apiKey;
}
