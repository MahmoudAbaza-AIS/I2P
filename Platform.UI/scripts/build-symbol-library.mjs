// Generates src/assets/symbol-designer/library.json from the sample symbols in
// public/Executive Dashboard/Symbols. Read-only on the symbol folder.
// Usage: npm run symbols:manifest
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const symbolsDir = join(root, 'public', 'Executive Dashboard', 'Symbols');
const outFile = join(root, 'src', 'assets', 'symbol-designer', 'library.json');

const displayName = (file) => {
  const base = file
    .replace(/\.svg$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return base ? base[0].toUpperCase() + base.slice(1) : file;
};

const entries = [];
for (const category of readdirSync(symbolsDir).sort()) {
  const dir = join(symbolsDir, category);
  if (!statSync(dir).isDirectory()) continue;
  for (const file of readdirSync(dir).sort()) {
    if (!file.toLowerCase().endsWith('.svg')) continue;
    entries.push({
      category,
      file,
      name: displayName(file),
      url: `/Executive Dashboard/Symbols/${category}/${file}`,
      sizeKb: Math.max(1, Math.round(statSync(join(dir, file)).size / 1024)),
    });
  }
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(entries, null, 2) + '\n', 'utf8');
console.log(`Wrote ${entries.length} symbols to ${outFile}`);
