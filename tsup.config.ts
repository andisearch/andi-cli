import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: ['esm', 'cjs'],
  target: 'node20',
  clean: true,
  splitting: false,
  sourcemap: false,
  shims: true,
  // No custom banner: tsup auto-hoists the shebang already present in src/cli.ts.
});
