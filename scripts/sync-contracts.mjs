import { copyFileSync, readFileSync } from 'node:fs';
const source = new URL('../shared/src/types/practice.ts', import.meta.url);
const backend = new URL('../backend/src/modules/practice/contracts.ts', import.meta.url);
if (process.argv.includes('--check')) {
  if (!readFileSync(source).equals(readFileSync(backend))) throw new Error('Practice DTOs differ. Run npm run contracts:sync.');
} else {
  copyFileSync(source, backend);
}
