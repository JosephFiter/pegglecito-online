// Uso: node tools/extract-pak.ts <archivo.pak> <carpeta-salida>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parsePak } from '../src/formats/pak.ts';

const [, , pakPath, outDir] = process.argv;
if (!pakPath || !outDir) {
  console.error('Uso: node tools/extract-pak.ts <archivo.pak> <carpeta-salida>');
  process.exit(1);
}

const entries = parsePak(readFileSync(pakPath));
for (const { name, data } of entries) {
  const out = join(outDir, name);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, data);
}
console.log(`${entries.length} archivos extraídos en ${outDir}`);
