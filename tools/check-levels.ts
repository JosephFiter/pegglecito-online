// Parsea todos los niveles extraídos y muestra un resumen.
// Uso: node tools/check-levels.ts <carpeta-con-.dat>...
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseLevel } from '../src/formats/level.ts';

let ok = 0, fail = 0;
for (const dir of process.argv.slice(2)) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.dat'))) {
    try {
      const level = parseLevel(readFileSync(join(dir, file)));
      const kinds: Record<string, number> = {};
      let pegs = 0, moving = 0;
      for (const e of level.entries) {
        kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
        if (e.peg) pegs++;
        if (e.movementLink) moving++;
      }
      console.log(`OK   ${file.padEnd(16)} v${level.version.toString(16)} pegs=${pegs} móviles=${moving}`, JSON.stringify(kinds));
      ok++;
    } catch (err) {
      console.log(`FAIL ${file.padEnd(16)} ${(err as Error).message}`);
      fail++;
    }
  }
}
console.log(`\n${ok} ok, ${fail} con error`);
