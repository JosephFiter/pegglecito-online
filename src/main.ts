import { Assets } from './assets/assets.ts';
import { clearPaks, loadPaks, savePaks, type StoredPak } from './assets/pakStore.ts';
import { parseLevel } from './formats/level.ts';
import { LevelScene } from './render/levelScene.ts';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const setup = $<HTMLElement>('#setup');
const viewer = $<HTMLElement>('#viewer');
const fileInput = $<HTMLInputElement>('#pak-input');
const status = $<HTMLElement>('#status');
const levelSelect = $<HTMLSelectElement>('#level');
const canvas = $<HTMLCanvasElement>('#screen');
const ctx = canvas.getContext('2d')!;

let assets: Assets;
let scene: LevelScene | null = null;
let seed = 1;
let playing = true;
let time = 0;
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
  const bytes = assets.file(`levels/${name}.dat`)!;
  const s = new LevelScene(parseLevel(bytes), assets, name);
  await s.load(seed);
  scene = s;
  time = 0;
}

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
$('#reroll').addEventListener('click', () => scene?.setSeed(++seed));
$('#pause').addEventListener('click', (e) => {
  playing = !playing;
  (e.target as HTMLButtonElement).textContent = playing ? 'Pausa' : 'Seguir';
});
$('#forget').addEventListener('click', async () => {
  await clearPaks();
  location.reload();
});

function frame(now: number) {
  if (playing) time += (now - last) / 10; // ms -> centésimas
  last = now;
  scene?.draw(ctx, time);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

loadPaks().then((paks) => {
  if (paks.length) start(paks);
});
