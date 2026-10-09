// Juega partidas automáticas (ángulos al azar) para chequear que la física no se rompa.
// Uso: node tools/simulate.ts <carpeta-con-.dat> [partidas-por-nivel]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseLevel } from '../src/formats/level.ts';
import * as C from '../src/game/constants.ts';
import { Game } from '../src/game/game.ts';
import { rng } from '../src/game/pegs.ts';

const [, , dir, gamesArg] = process.argv;
const games = Number(gamesArg ?? 3);
const MAX_SHOT_TICKS = 60 * C.TICKS_PER_SECOND;
let problems = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.dat') && !f.startsWith('_'))) {
  const level = parseLevel(readFileSync(join(dir, file)));
  const stats = { shots: 0, ticks: 0, maxTicks: 0, hits: 0, won: 0, escaped: 0, endless: 0 };
  for (let g = 0; g < games; g++) {
    const game = new Game(level, g + 1);
    const random = rng(g + 100);
    while (game.phase !== 'won' && game.phase !== 'lost') {
      game.setAim((random() * 2 - 1) * C.CANNON_MAX_ANGLE);
      game.shoot();
      let ticks = 0;
      while (game.phase === 'flying' && ticks < MAX_SHOT_TICKS) {
        game.step();
        ticks++;
        const b = game.ball;
        if (b && (!Number.isFinite(b.x) || !Number.isFinite(b.y) || b.x < -50 || b.x > 700 || b.y < -50)) {
          stats.escaped++;
          game.ball = null;
          game.phase = 'clearing';
        }
      }
      if (ticks >= MAX_SHOT_TICKS) { stats.endless++; game.ball = null; game.phase = 'clearing'; }
      stats.hits += game.events.filter((e) => e.type === 'hit').length;
      game.events.length = 0;
      stats.shots++;
      stats.ticks += ticks;
      stats.maxTicks = Math.max(stats.maxTicks, ticks);
      while (game.phase === 'clearing') game.step();
    }
    if (game.phase === 'won') stats.won++;
  }
  const bad = stats.escaped || stats.endless;
  if (bad) problems++;
  console.log(
    `${bad ? 'MAL ' : 'ok  '}${file.padEnd(18)} tiros=${stats.shots} prom=${(stats.ticks / stats.shots / 100).toFixed(1)}s ` +
      `max=${(stats.maxTicks / 100).toFixed(1)}s pegs/tiro=${(stats.hits / stats.shots).toFixed(1)} ganadas=${stats.won}/${games}` +
      (bad ? ` escapes=${stats.escaped} infinitos=${stats.endless}` : ''),
  );
}
console.log(problems ? `\n${problems} niveles con problemas` : '\nTodo ok');
