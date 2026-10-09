// Estado y simulación de una partida. No depende del DOM: se avanza de a un tick
// con `step()` y la única entrada del jugador es el ángulo de disparo (`shoot`).
// Así el mismo código puede correr en ambos clientes de una partida online.
import type { Level, LevelEntry } from '../formats/level.ts';
import * as C from './constants.ts';
import { assignPegColors, PegColor, rng } from './pegs.ts';
import { collide, entryShape, type Shape } from './shapes.ts';

export type PegState = 'active' | 'lit' | 'gone';

export interface Body {
  entry: LevelEntry;
  /** Índice entre los pegs (para colores); -1 si no es peg. */
  pegIndex: number;
  color: PegColor;
  state: PegState;
  moving: boolean;
  shape: Shape | null;
  /** Velocidad del objeto (px/tick), para que los objetos móviles empujen la bola. */
  vx: number;
  vy: number;
  /** Tick en que se encendió (para animaciones). */
  litAt: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export type Phase = 'aiming' | 'flying' | 'clearing' | 'won' | 'lost';

/** Eventos para el renderer/sonido; se vacían cada tick. */
export type GameEvent =
  | { type: 'shoot' }
  | { type: 'hit'; body: Body; points: number }
  | { type: 'bounce' }
  | { type: 'freeBall'; reason: 'bucket' | 'score' }
  | { type: 'pop'; body: Body }
  | { type: 'feverStart' }
  | { type: 'feverBucket'; points: number };

export class Game {
  readonly bodies: Body[];
  /** Tiempo del tablero (los objetos móviles nunca se detienen). */
  time = 0;
  phase: Phase = 'aiming';
  ball: Ball | null = null;
  ballsLeft = C.START_BALLS;
  score = 0;
  shotScore = 0;
  aim = 0;
  events: GameEvent[] = [];
  /** El último naranja ya fue golpeado: la bola cae a los baldes de bonus. */
  fever = false;

  private random: () => number;
  private freeBallsThisShot = 0;
  private shotStart = 0;
  private stuckWindow = { tick: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private clearTimer = 0;
  private hitThisShot: Body[] = [];

  constructor(level: Level, seed: number) {
    this.random = rng(seed ^ 0x9e3779b9);
    const pegEntries = level.entries.filter((e) => e.peg);
    const colors = assignPegColors(pegEntries.map((e) => e.peg!.variable), seed);
    this.bodies = level.entries.map((entry) => {
      const pegIndex = pegEntries.indexOf(entry);
      return {
        entry,
        pegIndex,
        color: pegIndex >= 0 ? colors[pegIndex] : PegColor.Blue,
        state: 'active',
        moving: !!entry.movementLink?.movement,
        shape: entryShape(entry, 0),
        vx: 0,
        vy: 0,
        litAt: 0,
      } satisfies Body;
    });
  }

  get pegs() {
    return this.bodies.filter((b) => b.pegIndex >= 0);
  }

  get orangesLeft() {
    return this.bodies.filter((b) => b.pegIndex >= 0 && b.color === PegColor.Orange && b.state === 'active').length;
  }

  get orangesHit() {
    return this.bodies.filter((b) => b.pegIndex >= 0 && b.color === PegColor.Orange && b.state !== 'active').length;
  }

  get multiplier() {
    const hit = this.orangesHit;
    for (const [n, m] of C.MULTIPLIER_STEPS) if (hit >= n) return m;
    return 1;
  }

  /** Posición x del centro del balde en el tick actual. */
  get bucketX() {
    const phase = (this.time % C.BUCKET_PERIOD) / C.BUCKET_PERIOD;
    const s = (1 - Math.cos(phase * Math.PI * 2)) / 2; // 0..1..0, frena en los extremos
    return C.BUCKET_MIN_X + (C.BUCKET_MAX_X - C.BUCKET_MIN_X) * s;
  }

  /** Punta del cañón para un ángulo dado (0 = hacia abajo, positivo = a la derecha). */
  static muzzle(angle: number) {
    return {
      x: C.CANNON_X + Math.sin(angle) * C.CANNON_LENGTH,
      y: C.CANNON_Y + Math.cos(angle) * C.CANNON_LENGTH,
    };
  }

  setAim(angle: number) {
    this.aim = Math.max(-C.CANNON_MAX_ANGLE, Math.min(C.CANNON_MAX_ANGLE, angle));
  }

  /**
   * Trayectoria que seguiría la bola con el ángulo actual hasta el primer choque.
   * Devuelve puntos cada pocos ticks (para dibujar la línea punteada).
   */
  guide(everyTicks = 3): { x: number; y: number }[] {
    const m = Game.muzzle(this.aim);
    const ball = { x: m.x, y: m.y, vx: Math.sin(this.aim) * C.LAUNCH_SPEED, vy: Math.cos(this.aim) * C.LAUNCH_SPEED };
    const points = [{ x: ball.x, y: ball.y }];
    const r = C.BALL_RADIUS;
    const h = C.CANNON_HOUSING;
    for (let t = 1; t <= C.GUIDE_MAX_TICKS; t++) {
      ball.vy += C.GRAVITY;
      ball.x += ball.vx;
      ball.y += ball.vy;
      const hitWall = ball.x - r < C.WALL_LEFT || ball.x + r > C.WALL_RIGHT || ball.y - r > C.FLOOR;
      const hitBody =
        hitWall ||
        this.bodies.some((b) => b.state !== 'gone' && b.shape && collide(ball.x, ball.y, r, b.shape)) ||
        (t > 5 && !!collide(ball.x, ball.y, r, { type: 'circle', x: h.x, y: h.y, r: h.r }));
      if (hitBody || t % everyTicks === 0) points.push({ x: ball.x, y: ball.y });
      if (hitBody) break;
    }
    return points;
  }

  shoot() {
    if (this.phase !== 'aiming') return false;
    const m = Game.muzzle(this.aim);
    this.ball = {
      x: m.x,
      y: m.y,
      vx: Math.sin(this.aim) * C.LAUNCH_SPEED,
      vy: Math.cos(this.aim) * C.LAUNCH_SPEED,
    };
    this.ballsLeft--;
    this.shotScore = 0;
    this.freeBallsThisShot = 0;
    this.hitThisShot = [];
    this.shotStart = this.time;
    this.resetStuckWindow(m.x, m.y);
    this.phase = 'flying';
    this.events.push({ type: 'shoot' });
    return true;
  }

  step() {
    this.time++;
    this.updateBodies();
    if (this.phase === 'flying') this.stepBall();
    else if (this.phase === 'clearing') this.stepClearing();
  }

  private updateBodies() {
    for (const b of this.bodies) {
      if (!b.moving || b.state === 'gone') continue;
      const prev = b.shape;
      b.shape = entryShape(b.entry, this.time);
      if (prev && b.shape) {
        const [px, py] = center(prev), [nx, ny] = center(b.shape);
        b.vx = nx - px;
        b.vy = ny - py;
      }
    }
  }

  private stepBall() {
    const ball = this.ball!;
    ball.vy += C.GRAVITY;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > C.MAX_SPEED) {
      ball.vx *= C.MAX_SPEED / speed;
      ball.vy *= C.MAX_SPEED / speed;
    }

    for (let s = 0; s < C.SUBSTEPS; s++) {
      ball.x += ball.vx / C.SUBSTEPS;
      ball.y += ball.vy / C.SUBSTEPS;
      this.collideWalls(ball);
      if (this.time - this.shotStart < C.GHOST_SHOT_TICKS) this.collideBodies(ball);
      if (!this.fever) this.collideBucketRims(ball);
    }

    this.checkStuck(ball);

    if (this.fever && ball.y > C.FEVER_Y) return this.endFever(ball);
    if (!this.fever && this.inBucket(ball)) {
      this.events.push({ type: 'freeBall', reason: 'bucket' });
      this.ballsLeft++;
      return this.endShot();
    }
    if (ball.y - C.BALL_RADIUS > C.FLOOR) this.endShot();
  }

  private collideWalls(ball: Ball) {
    const r = C.BALL_RADIUS;
    if (ball.x - r < C.WALL_LEFT) {
      ball.x = C.WALL_LEFT + r;
      if (ball.vx < 0) ball.vx = -ball.vx * C.RESTITUTION_WALL;
    } else if (ball.x + r > C.WALL_RIGHT) {
      ball.x = C.WALL_RIGHT - r;
      if (ball.vx > 0) ball.vx = -ball.vx * C.RESTITUTION_WALL;
    }
    if (ball.y - r < C.CEILING) {
      ball.y = C.CEILING + r;
      if (ball.vy < 0) ball.vy = -ball.vy * C.RESTITUTION_WALL;
    }
    const h = C.CANNON_HOUSING;
    const c = collide(ball.x, ball.y, r, { type: 'circle', x: h.x, y: h.y, r: h.r });
    if (c) this.resolve(ball, c.nx, c.ny, c.depth, 0, 0, C.RESTITUTION_WALL);
  }

  private collideBodies(ball: Ball) {
    for (const b of this.bodies) {
      if (b.state === 'gone' || !b.shape) continue;
      const c = collide(ball.x, ball.y, C.BALL_RADIUS, b.shape);
      if (!c) continue;
      const bounced = this.resolve(ball, c.nx, c.ny, c.depth, b.vx, b.vy, C.RESTITUTION_PEG);
      if (bounced) this.events.push({ type: 'bounce' });
      if (b.pegIndex >= 0 && b.state === 'active') this.hit(b);
    }
  }

  /** Separa la bola y refleja la velocidad. Devuelve true si hubo rebote. */
  private resolve(ball: Ball, nx: number, ny: number, depth: number, ox: number, oy: number, e: number) {
    ball.x += nx * depth;
    ball.y += ny * depth;
    const rvx = ball.vx - ox, rvy = ball.vy - oy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return false;
    ball.vx = rvx - (1 + e) * vn * nx + ox;
    ball.vy = rvy - (1 + e) * vn * ny + oy;
    return -vn > 0.5;
  }

  private hit(b: Body) {
    b.state = 'lit';
    b.litAt = this.time;
    this.hitThisShot.push(b);
    const base =
      b.color === PegColor.Orange ? C.PEG_POINTS.orange
      : b.color === PegColor.Purple ? C.PEG_POINTS.purple
      : b.color === PegColor.Green ? C.PEG_POINTS.green
      : C.PEG_POINTS.blue;
    const points = base * this.multiplier;
    this.score += points;
    this.shotScore += points;
    this.events.push({ type: 'hit', body: b, points });

    while (
      this.freeBallsThisShot < C.FREE_BALL_SCORES.length &&
      this.shotScore >= C.FREE_BALL_SCORES[this.freeBallsThisShot]
    ) {
      this.freeBallsThisShot++;
      this.ballsLeft++;
      this.events.push({ type: 'freeBall', reason: 'score' });
    }

    if (b.color === PegColor.Orange && this.orangesLeft === 0) {
      this.fever = true;
      this.events.push({ type: 'feverStart' });
    }
  }

  /** Bordes del balde: dos círculos que hacen rebotar la bola. */
  bucketRims() {
    const x = this.bucketX, y = C.BUCKET_Y + 6;
    return [
      { x: x - C.BUCKET_MOUTH - 6, y, r: 6 },
      { x: x + C.BUCKET_MOUTH + 6, y, r: 6 },
    ];
  }

  private collideBucketRims(ball: Ball) {
    for (const rim of this.bucketRims()) {
      const c = collide(ball.x, ball.y, C.BALL_RADIUS, { type: 'circle', ...rim });
      if (c) this.resolve(ball, c.nx, c.ny, c.depth, 0, 0, C.RESTITUTION_WALL);
    }
  }

  private inBucket(ball: Ball) {
    return ball.vy > 0 && ball.y > C.BUCKET_Y + 10 && Math.abs(ball.x - this.bucketX) < C.BUCKET_MOUTH;
  }

  /** Si la bola quedó trabada, saca los pegs encendidos que tiene cerca (como el original). */
  private checkStuck(ball: Ball) {
    const w = this.stuckWindow;
    w.minX = Math.min(w.minX, ball.x); w.maxX = Math.max(w.maxX, ball.x);
    w.minY = Math.min(w.minY, ball.y); w.maxY = Math.max(w.maxY, ball.y);
    const age = this.time - this.shotStart;
    const longShot = age >= C.LONG_SHOT_TICKS && age % C.TICKS_PER_SECOND === 0;
    if (this.time - w.tick >= C.STUCK_TICKS) {
      const stuck = w.maxX - w.minX < C.STUCK_BOX && w.maxY - w.minY < C.STUCK_BOX;
      this.resetStuckWindow(ball.x, ball.y);
      if (stuck) this.popLitNear(ball);
    } else if (longShot) this.popLitNear(ball);
  }

  private resetStuckWindow(x: number, y: number) {
    this.stuckWindow = { tick: this.time, minX: x, maxX: x, minY: y, maxY: y };
  }

  private popLitNear(ball: Ball) {
    for (const b of this.bodies) {
      if (b.state !== 'lit' || !b.shape) continue;
      if (collide(ball.x, ball.y, C.BALL_RADIUS + C.STUCK_REACH, b.shape)) {
        b.state = 'gone';
        this.events.push({ type: 'pop', body: b });
      }
    }
  }

  private endFever(ball: Ball) {
    const slot = Math.floor(((ball.x - C.WALL_LEFT) / (C.WALL_RIGHT - C.WALL_LEFT)) * C.FEVER_BUCKETS.length);
    const points = C.FEVER_BUCKETS[Math.max(0, Math.min(C.FEVER_BUCKETS.length - 1, slot))];
    this.score += points;
    this.events.push({ type: 'feverBucket', points });
    this.ball = null;
    this.phase = 'won';
  }

  private endShot() {
    this.ball = null;
    this.phase = 'clearing';
    this.clearTimer = 0;
  }

  /** Al final del tiro los pegs encendidos se borran de a uno. */
  private stepClearing() {
    if (++this.clearTimer < C.CLEAR_INTERVAL) return;
    this.clearTimer = 0;
    const next = this.hitThisShot.find((b) => b.state === 'lit');
    if (next) {
      next.state = 'gone';
      this.events.push({ type: 'pop', body: next });
      return;
    }
    this.startTurn();
  }

  private startTurn() {
    if (this.ballsLeft <= 0) {
      this.phase = 'lost';
      return;
    }
    this.movePurple();
    this.phase = 'aiming';
  }

  /** El violeta cambia de lugar en cada turno, a un azul al azar. */
  private movePurple() {
    const pegs = this.pegs;
    for (const b of pegs) if (b.color === PegColor.Purple && b.state === 'active') b.color = PegColor.Blue;
    const blues = pegs.filter((b) => b.color === PegColor.Blue && b.state === 'active');
    if (blues.length) blues[Math.floor(this.random() * blues.length)].color = PegColor.Purple;
  }
}

function center(s: Shape): [number, number] {
  return s.type === 'circle' ? [s.x, s.y] : [s.cx, s.cy];
}
