// Constantes del juego. Todo está en coordenadas del nivel (pantalla - BOARD_OFFSET)
// y el tiempo en ticks de 1/100 s, igual que el original.
// Los valores de física están ajustados a ojo para que se sienta parecido a Peggle.

export const TICKS_PER_SECOND = 100;

export const BOARD_OFFSET_X = 73;
export const BOARD_OFFSET_Y = 43;

// Bordes jugables (medidos sobre la interfaz original).
export const WALL_LEFT = 8;
export const WALL_RIGHT = 646;
export const CEILING = 12;
/** Debajo de esta línea la bola se considera perdida. */
export const FLOOR = 575;

// Cañón
export const CANNON_X = 327;
export const CANNON_Y = 42;
/** Distancia del pivote a la punta del cañón (de donde sale la bola). */
export const CANNON_LENGTH = 70;
/** Ángulo máximo respecto de la vertical, en radianes (~87°). */
export const CANNON_MAX_ANGLE = (87 * Math.PI) / 180;
/** Soporte circular del cañón, que también es sólido. */
export const CANNON_HOUSING = { x: 327, y: 20, r: 72 };

// Bola
export const BALL_RADIUS = 7;
export const GRAVITY = 0.05; // px/tick²
export const LAUNCH_SPEED = 6.5; // px/tick
export const MAX_SPEED = 12;
export const RESTITUTION_PEG = 0.82;
export const RESTITUTION_WALL = 0.8;
/** Sub-pasos de física por tick (evita que la bola atraviese ladrillos). */
export const SUBSTEPS = 4;

// Balde (free ball)
export const BUCKET_WIDTH = 141;
export const BUCKET_HEIGHT = 47;
export const BUCKET_Y = 557 - BUCKET_HEIGHT; // borde superior
/** Mitad del ancho de la boca del balde, donde la bola entra. */
export const BUCKET_MOUTH = 50;
export const BUCKET_PERIOD = 600; // ticks para ir y volver
export const BUCKET_MIN_X = WALL_LEFT + BUCKET_WIDTH / 2;
export const BUCKET_MAX_X = WALL_RIGHT - BUCKET_WIDTH / 2;

// Guía de puntería
export const GUIDE_MAX_TICKS = 250;

// Reglas
export const START_BALLS = 10;
export const PEG_POINTS = { blue: 10, orange: 100, purple: 500, green: 10 } as const;
/** Multiplicador según cuántos naranjas fueron golpeados. */
export const MULTIPLIER_STEPS: [orangesHit: number, multiplier: number][] = [
  [22, 10],
  [19, 5],
  [15, 3],
  [10, 2],
];
/** Puntaje en un solo tiro que da bola extra (cada umbral una vez por tiro). */
export const FREE_BALL_SCORES = [25000, 75000, 125000];
/** Bonus de los baldes del "Extreme Fever" (de izquierda a derecha). */
export const FEVER_BUCKETS = [10000, 50000, 100000, 50000, 10000];
/** Altura (borde superior) de los baldes de bonus del fever. */
export const FEVER_Y = 530;

/** Si la bola no salió de una caja de este tamaño en ese tiempo, está trabada:
 *  se sacan los pegs encendidos que tiene cerca (como el original). */
export const STUCK_TICKS = 150;
export const STUCK_BOX = 40;
/** Distancia (desde el borde de la bola) a la que un peg encendido se considera "cerca". */
export const STUCK_REACH = 15;
/** Tiros largos (ej. bola rodando sobre un objeto que gira): desde este tick
 *  se sacan los pegs encendidos cercanos cada segundo... */
export const LONG_SHOT_TICKS = 1000;
/** ...y desde este, la bola deja de chocar y cae. */
export const GHOST_SHOT_TICKS = 2000;
/** Ticks entre cada peg que se borra al final del tiro. */
export const CLEAR_INTERVAL = 6;
