// Colores de pegs. En Peggle los pegs "variables" del nivel se sortean al empezar:
// 25 naranjas y 2 verdes; el violeta se re-sortea en cada turno entre los azules.
// Usamos un RNG con semilla para que dos jugadores online vean exactamente lo mismo.

export const PegColor = { Blue: 0, Orange: 1, Purple: 2, Green: 3 } as const;
export type PegColor = (typeof PegColor)[keyof typeof PegColor];

export const ORANGE_COUNT = 25;
export const GREEN_COUNT = 2;

/** Mulberry32: RNG chico, rápido y determinista (mismo resultado en todos los navegadores). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Devuelve el color de cada peg dado el flag `variable` de cada uno.
 * Los no variables quedan azules (igual que en el juego).
 */
export function assignPegColors(variable: boolean[], seed: number): PegColor[] {
  const random = rng(seed);
  const colors: PegColor[] = variable.map(() => PegColor.Blue);
  const pool = variable.flatMap((v, i) => (v ? [i] : []));
  // Fisher-Yates
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  let k = 0;
  for (; k < Math.min(ORANGE_COUNT, pool.length); k++) colors[pool[k]] = PegColor.Orange;
  for (let g = 0; g < GREEN_COUNT && k < pool.length; g++, k++) colors[pool[k]] = PegColor.Green;
  if (k < pool.length) colors[pool[k]] = PegColor.Purple;
  return colors;
}
