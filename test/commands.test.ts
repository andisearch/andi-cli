import { describe, expect, it } from 'vitest';
import { COMMANDS, EXIT_CODE_TABLE, SEARCH_MODES } from '../src/commands.js';
import { renderHelp } from '../src/help.js';
import { EXIT_CODES } from '../src/output.js';

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
});

describe('renderHelp', () => {
  it('mentions every command usage line', () => {
    const help = renderHelp();
    for (const command of COMMANDS) {
      expect(help).toContain(command.usage);
    }
  });
});
