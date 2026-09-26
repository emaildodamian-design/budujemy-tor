// Runs a TypeScript script through Vite's module runner (no extra dependencies).
// Usage: node scripts/run-ts.mjs <file.ts> [args...]
import { runnerImport } from 'vite';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/run-ts.mjs <file.ts> [args...]');
  process.exit(2);
}
await runnerImport(file, { logLevel: 'error' });
