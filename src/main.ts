import { Assets } from './assets/assets.ts';
import { clearPaks, loadPaks, savePaks, type StoredPak } from './assets/pakStore.ts';
import { parseLevel } from './formats/level.ts';
import * as C from './game/constants.ts';
import { Game } from './game/game.ts';
import { GameView } from './render/gameView.ts';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const setup = $<HTMLElement>('#setup');
const viewer = $<HTMLElement>('#viewer');
const fileInput = $<HTMLInputElement>('#pak-input');
const status = $<HTMLElement>('#status');
const levelSelect = $<HTMLSelectElement>('#level');
const canvas = $<HTMLCanvasElement>('#screen');
const ctx = canvas.getContext('2d')!;

const MS_PER_TICK = 1000 / C.TICKS_PER_SECOND;
/** Si la pestaña estuvo en segundo plano, no simular más que esto de golpe. */
const MAX_CATCHUP_TICKS = 25;

let assets: Assets;
let game: Game | null = null;
let view: GameView | null = null;
let seed = Date.now() >>> 0;
let accumulator = 0;
let paused = false;
let last = performance.now();

async function start(paks: StoredPak[]) {
  assets = new Assets();
  // main.pak primero, así los level packs pueden pisar archivos.
  paks.sort((a, b) => Number(b.name.toLowerCase() === 'main.pak') - Number(a.name.toLowerCase() === 'main.pak'));
  for (const p of paks) assets.addPak(p.bytes);

  if (!assets.file('levels/stages.cfg')) {
    status.textContent = 'Ese archivo no parece ser el main.pak de Peggle Nights.';
    return false;
  }

  const levels = assets
    .list('levels/')
    .filter((f) => f.endsWith('.dat') && !f.includes('/_'))
    .map((f) => f.slice('levels/'.length, -'.dat'.length))
    .sort();
  levelSelect.replaceChildren(...levels.map((l) => new Option(l, l)));
  setup.hidden = true;
  viewer.hidden = false;
  await openLevel(levels[0]);
  return true;
}

async function openLevel(name: string) {
  const level = parseLevel(assets.file(`levels/${name}.dat`)!);
  const g = new Game(level, seed++);
  const v = new GameView(assets, name);
  await v.load(g);
  game = g;
  view = v;
}

/** Convierte coordenadas del mouse a coordenadas del nivel. */
function toLevel(ev: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) * 800) / rect.width - C.BOARD_OFFSET_X,
    y: ((ev.clientY - rect.top) * 600) / rect.height - C.BOARD_OFFSET_Y,
  };
}

function aimAt(ev: MouseEvent) {
  if (!game) return;
  const p = toLevel(ev);
  game.setAim(Math.atan2(p.x - C.CANNON_X, Math.max(1, p.y - C.CANNON_Y)));
}

canvas.addEventListener('mousemove', aimAt);
canvas.addEventListener('click', (ev) => {
  if (!game) return;
  if (game.phase === 'won' || game.phase === 'lost') return void openLevel(levelSelect.value);
  aimAt(ev);
  game.shoot();
});
window.addEventListener('keydown', (ev) => {
  if (!game) return;
  const fine = ev.shiftKey ? 0.002 : 0.01;
  if (ev.key === 'ArrowLeft') game.setAim(game.aim + fine);
  else if (ev.key === 'ArrowRight') game.setAim(game.aim - fine);
  else if (ev.key === ' ' || ev.key === 'Enter') game.shoot();
  else return;
  ev.preventDefault();
});

fileInput.addEventListener('change', async () => {
  const files = [...(fileInput.files ?? [])];
  if (!files.length) return;
  status.textContent = 'Cargando...';
  const paks = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
  try {
    if (await start(paks)) await savePaks(paks);
  } catch (err) {
    status.textContent = `Error: ${(err as Error).message}`;
  }
});

levelSelect.addEventListener('change', () => openLevel(levelSelect.value));
$('#restart').addEventListener('click', () => openLevel(levelSelect.value));
$('#forget').addEventListener('click', async () => {
  await clearPaks();
  location.reload();
});

function tick() {
  if (!game || !view) return;
  game.step();
  view.handleEvents(game, game.events);
  game.events.length = 0;
}

function frame(now: number) {
  accumulator = Math.min(accumulator + now - last, MAX_CATCHUP_TICKS * MS_PER_TICK);
  last = now;
  if (game && view) {
    if (paused) accumulator = 0;
    for (; accumulator >= MS_PER_TICK; accumulator -= MS_PER_TICK) tick();
    view.draw(ctx, game);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Solo en desarrollo: permite inspeccionar y avanzar la partida desde la consola.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __peggle: {
      get game() { return game; },
      set paused(v: boolean) { paused = v; },
      step(n = 1) {
        for (let i = 0; i < n; i++) tick();
        if (game && view) view.draw(ctx, game);
      },
    },
  });
}

loadPaks().then((paks) => {
  if (paks.length) start(paks);
});
