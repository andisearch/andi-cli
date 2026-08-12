import { describe, expect, it } from 'vitest';
import { COMMANDS, EXIT_CODE_TABLE, SEARCH_MODES } from '../src/commands.js';
import { renderHelp } from '../src/help.js';
import { EXIT_CODES } from '../src/output.js';

const flagNames = (command: string): string[] =>
  COMMANDS.find((c) => c.name === command)!.flags.map((f) => f.name);

describe('command table', () => {
  it('declares exactly the four shipped commands', () => {
    expect(COMMANDS.map((c) => c.name).sort()).toEqual(['fetch', 'mcp', 'schema', 'search']);
  });

  it('exit code table matches output.ts EXIT_CODES (single source, not duplicated)', () => {
    expect(EXIT_CODE_TABLE).toEqual(EXIT_CODES);
  });

  it('search --mode enum excludes the non-public modes (free, fan-out)', () => {
    expect(SEARCH_MODES).not.toContain('free');
    expect(SEARCH_MODES).not.toContain('fan-out');
    expect(SEARCH_MODES).toContain('auto');
  });

  it('search declares every API parameter the command forwards', () => {
    expect(flagNames('search')).toEqual(
      expect.arrayContaining([
        '--mode', '--limit', '--offset', '--country', '--language', '--safe', '--date-range',
        '--include-domains', '--exclude-domains', '--content', '--max-content-length',
        '--format', '--json', '--api-key',
      ])
    );
  });

  it('fetch declares --query for query-focused extracts', () => {
    expect(flagNames('fetch')).toEqual(expect.arrayContaining(['--query', '--format', '--max-content-length']));
  });
});

describe('renderHelp', () => {
  it('mentions every command usage line', () => {
    const help = renderHelp();
    for (const command of COMMANDS) {
      expect(help).toContain(command.usage);
    }
  });

  it('documents every declared flag', () => {
    const help = renderHelp();
    for (const command of COMMANDS) {
      for (const flag of command.flags) {
        expect(help).toContain(flag.name);
      }
    }
  });
});
