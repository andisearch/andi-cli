/** Renders `--help` text from the COMMANDS table — never maintained separately from it. */
import { COMMANDS } from './commands.js';
import { printHuman } from './output.js';

export function renderHelp(): string {
  const lines: string[] = [
    'andi — command-line interface for the Andi Search API',
    '',
    'Usage: andi <command> [flags]',
    '',
    'Commands:',
  ];
  for (const command of COMMANDS) {
    lines.push(`  ${command.usage}`);
    lines.push(`      ${command.description}`);
    for (const flag of command.flags) {
      const argPart = flag.arg ? ` ${flag.arg}` : '';
      const enumPart = flag.enum ? ` (${flag.enum.join('|')})` : '';
      const defaultPart = flag.default ? ` [default: ${flag.default}]` : '';
      lines.push(`        ${flag.name}${argPart}${enumPart}  ${flag.description}${defaultPart}`);
    }
    lines.push('');
  }
  lines.push('Global flags:');
  lines.push('  --help, -h       Show this help.');
  lines.push('  --version        Print the CLI version.');
  lines.push('');
  lines.push('Auth: --api-key flag > ANDI_API_KEY env > ~/.andi/config.json > none.');
  lines.push('Env:  ANDI_API_BASE overrides the API base URL (default https://api.andiai.com).');
  lines.push('Docs: https://api.andiai.com/auth.md · https://docs.andiai.com');
  return lines.join('\n');
}

export function printHelp(): void {
  printHuman(renderHelp());
}
