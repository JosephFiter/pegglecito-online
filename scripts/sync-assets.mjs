// Copia a public/ lo que la página sirve tal cual:
//  - EmulatorJS (loader + scripts) y los núcleos de DS, desde node_modules
//  - la ROM: el primer .nds de la raíz del repo, como public/game.nds
// Corre solo después de `npm install` (postinstall) o con `npm run sync`.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pub = join(root, "public");
const ejsData = join(root, "node_modules/@emulatorjs/emulatorjs/data");
const out = join(pub, "emulatorjs");
const CORES = ["melonds", "desmume"];

rmSync(out, { recursive: true, force: true });
cpSync(ejsData, out, { recursive: true });
for (const core of CORES) {
  const pkg = join(root, "node_modules/@emulatorjs", "core-" + core);
  for (const f of readdirSync(pkg)) {
    if (f.endsWith(".data")) cpSync(join(pkg, f), join(out, "cores", f));
  }
  mkdirSync(join(out, "cores/reports"), { recursive: true });
  cpSync(join(pkg, "reports"), join(out, "cores/reports"), { recursive: true });
}
console.log("EmulatorJS + núcleos (" + CORES.join(", ") + ") -> public/emulatorjs/");

const rom = readdirSync(root).find((f) => f.toLowerCase().endsWith(".nds"));
if (rom) {
  cpSync(join(root, rom), join(pub, "game.nds"));
  console.log(`"${rom}" -> public/game.nds`);
} else if (!existsSync(join(pub, "game.nds"))) {
  console.warn("No hay ningún .nds en la raíz del repo: copiá tu ROM ahí y corré `npm run sync`.");
}
