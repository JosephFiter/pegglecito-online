// Dibuja una partida en un canvas de 800x600: fondo, decorados, pegs, bola, cañón y HUD.
import type { Assets, Image } from '../assets/assets.ts';
import type { BrickEntry, LevelEntry } from '../formats/level.ts';
import * as C from '../game/constants.ts';
import { Game, type Body, type GameEvent } from '../game/game.ts';
import { movementAngle } from '../game/movement.ts';
import { PegColor } from '../game/pegs.ts';
import { entryPosition } from '../game/shapes.ts';

const PEG_SPRITE = 20; // ballpeg: celdas de 20x20 (azul, naranja, violeta, verde; abajo los encendidos)
const BRICK_SPRITE_H = 20;
const LIT_ROW_OFFSET = 4;
const CANNON_FRAME_H = 57;
const CANNON_SPRITE_TOP = 15; // distancia del pivote al borde superior del sprite del cañón
const POP_TICKS = 25;

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
}

export class GameView {
  private background: Image | null = null;
  private pegSprite: Image | null = null;
  private brickSprite: Image | null = null;
  private ballSprite: Image | null = null;
  private cannonSprite: Image | null = null;
  private bucketSprite: Image | null = null;
  private entryImages = new Map<LevelEntry, Image>();
  private popups: Popup[] = [];
  private pops: { body: Body; born: number }[] = [];
  private assets: Assets;
  private levelName: string;

  constructor(assets: Assets, levelName: string) {
    this.assets = assets;
    this.levelName = levelName;
  }

  async load(game: Game) {
    const a = this.assets;
    [this.background, this.pegSprite, this.brickSprite, this.ballSprite, this.cannonSprite, this.bucketSprite] =
      await Promise.all([
        a.image(`levels/${this.levelName}`),
        a.image('images/game/ballpeg'),
        a.image('images/game/brick'),
        a.image('images/game/ball'),
        a.image('images/interface/cannon'),
        a.image('images/game/bbucket'),
      ]);
    await Promise.all(
      game.bodies.map(async ({ entry: e }) => {
        if (!e.image || e.kind === 'emitter') return;
        const img = (await a.image(e.image)) ?? (await a.image(`images/levels/${e.image}`));
        if (img) this.entryImages.set(e, img);
      }),
    );
  }

  /** Procesa los eventos de la simulación (textos de puntos, animaciones). */
  handleEvents(game: Game, events: GameEvent[]) {
    for (const ev of events) {
      if (ev.type === 'hit') {
        const p = entryPosition(ev.body.entry, game.time);
        this.popups.push({ x: p.x, y: p.y - 12, text: `${ev.points}`, color: pegTextColor(ev.body.color), born: game.time });
      } else if (ev.type === 'pop') {
        this.pops.push({ body: ev.body, born: game.time });
      } else if (ev.type === 'freeBall') {
        this.popups.push({ x: C.CANNON_X, y: 150, text: '¡BOLA EXTRA!', color: '#7f7', born: game.time });
      } else if (ev.type === 'feverStart') {
        this.popups.push({ x: C.CANNON_X, y: 250, text: '¡EXTREME FEVER!', color: '#fc4', born: game.time });
      } else if (ev.type === 'feverBucket') {
        this.popups.push({ x: C.CANNON_X, y: 300, text: `+${ev.points.toLocaleString('es-AR')}`, color: '#fc4', born: game.time });
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, game: Game) {
    const t = game.time;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 800, 600);
    if (this.background) {
      const bg = this.background;
      ctx.drawImage(bg, 400 - bg.width / 2, 300 - bg.height / 2);
    }

    ctx.save();
    ctx.translate(C.BOARD_OFFSET_X, C.BOARD_OFFSET_Y);
    this.drawFrame(ctx);

    const bodies = game.bodies;
    for (const b of bodies) if (b.entry.background) this.drawBody(ctx, b, t);
    for (const b of bodies) if (!b.entry.background && !b.entry.foreground) this.drawBody(ctx, b, t);
    this.drawPops(ctx, t);

    if (game.phase === 'aiming') this.drawGuide(ctx, game);
    if (game.fever) this.drawFeverBuckets(ctx);
    else this.drawBucket(ctx, game, 1);
    if (game.ball && this.ballSprite) {
      const s = this.ballSprite;
      ctx.drawImage(s, game.ball.x - s.width / 2, game.ball.y - s.height / 2);
    }
    if (!game.fever) this.drawBucket(ctx, game, 0);

    for (const b of bodies) if (b.entry.foreground) this.drawBody(ctx, b, t);
    this.drawCannon(ctx, game);
    this.drawPopups(ctx, t);
    ctx.restore();

    this.drawHud(ctx, game);
  }

  private drawFrame(ctx: CanvasRenderingContext2D) {
    // Marco provisorio (todavía no armamos la interfaz original).
    ctx.fillStyle = 'rgba(10, 20, 60, 0.85)';
    ctx.fillRect(-C.BOARD_OFFSET_X, -C.BOARD_OFFSET_Y, C.WALL_LEFT + C.BOARD_OFFSET_X, 600);
    ctx.fillRect(C.WALL_RIGHT, -C.BOARD_OFFSET_Y, 800, 600);
    ctx.fillRect(C.WALL_LEFT, -C.BOARD_OFFSET_Y, C.WALL_RIGHT - C.WALL_LEFT, C.CEILING + C.BOARD_OFFSET_Y);
    const h = C.CANNON_HOUSING;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c9a24a';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  private drawBody(ctx: CanvasRenderingContext2D, b: Body, t: number) {
    const e = b.entry;
    const m = e.movementLink?.movement;
    const pos = entryPosition(e, t);

    const img = this.entryImages.get(e);
    if (img && e.visible) {
      ctx.save();
      ctx.translate(pos.x + (e.imageDX ?? 0), pos.y + (e.imageDY ?? 0));
      const spin = m && e.kind !== 'brick' ? (movementAngle(m, t, 0) * Math.PI) / 180 : 0;
      ctx.rotate(spin - (e.imageRotation ?? 0));
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    }

    if (b.pegIndex < 0 || b.state === 'gone') return;
    const row = b.color + (b.state === 'lit' ? LIT_ROW_OFFSET : 0);
    if (e.kind === 'circle') this.drawPeg(ctx, pos.x, pos.y, e.radius, row);
    else if (e.kind === 'brick') this.drawBrick(ctx, e, pos.x, pos.y, m ? movementAngle(m, t, e.angle) : e.angle, row);
  }

  /** Pegs que se están borrando: se agrandan y se desvanecen. */
  private drawPops(ctx: CanvasRenderingContext2D, t: number) {
    this.pops = this.pops.filter((p) => t - p.born < POP_TICKS);
    for (const { body, born } of this.pops) {
      const k = (t - born) / POP_TICKS;
      const e = body.entry;
      const pos = entryPosition(e, t);
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.translate(pos.x, pos.y);
      ctx.scale(1 + k * 0.6, 1 + k * 0.6);
      ctx.translate(-pos.x, -pos.y);
      const row = body.color + LIT_ROW_OFFSET;
      if (e.kind === 'circle') this.drawPeg(ctx, pos.x, pos.y, e.radius, row);
      else if (e.kind === 'brick') {
        const m = e.movementLink?.movement;
        this.drawBrick(ctx, e, pos.x, pos.y, m ? movementAngle(m, t, e.angle) : e.angle, row);
      }
      ctx.restore();
    }
  }

  private drawPeg(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, row: number) {
    const s = this.pegSprite;
    if (!s) return;
    ctx.drawImage(s, 0, row * PEG_SPRITE, PEG_SPRITE, PEG_SPRITE, x - r, y - r, r * 2, r * 2);
  }

  private drawBrick(ctx: CanvasRenderingContext2D, b: BrickEntry, x: number, y: number, angleDeg: number, row: number) {
    const s = this.brickSprite;
    if (!s) return;
    const theta = (-angleDeg * Math.PI) / 180;
    ctx.save();
    if (!b.curved) {
      ctx.translate(x, y);
      ctx.rotate(theta + Math.PI / 2);
      ctx.drawImage(s, 0, row * BRICK_SPRITE_H, s.width, BRICK_SPRITE_H, -b.length / 2, -b.width / 2, b.length, b.width);
      ctx.restore();
      return;
    }

    // Curvo: sector de anillo; (x,y) es el punto medio del grosor. La textura va en franjas.
    const inner = b.length, outer = b.length + b.width, mid = inner + b.width / 2;
    const cx = x - mid * Math.cos(theta), cy = y - mid * Math.sin(theta);
    const half = (b.sectorAngle * Math.PI) / 360;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, theta - half, theta + half);
    ctx.arc(cx, cy, inner, theta + half, theta - half, true);
    ctx.closePath();
    ctx.clip();
    const slices = Math.max(4, Math.ceil(b.sectorAngle / 3));
    const step = (half * 2) / slices;
    const sliceLen = mid * step + 1; // +1 para que no queden huecos entre franjas
    const srcW = s.width / slices;
    for (let i = 0; i < slices; i++) {
      const a = theta - half + step * (i + 0.5);
      ctx.save();
      ctx.translate(cx + mid * Math.cos(a), cy + mid * Math.sin(a));
      ctx.rotate(a + Math.PI / 2);
      ctx.drawImage(s, srcW * i, row * BRICK_SPRITE_H, srcW, BRICK_SPRITE_H, -sliceLen / 2, -b.width / 2, sliceLen, b.width);
      ctx.restore();
    }
    ctx.restore();
  }

  private drawGuide(ctx: CanvasRenderingContext2D, game: Game) {
    const pts = game.guide();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (let i = 1; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** row 1 = parte de atrás, row 0 = frente (se dibuja encima de la bola). */
  private drawBucket(ctx: CanvasRenderingContext2D, game: Game, row: 0 | 1) {
    const s = this.bucketSprite;
    if (!s) return;
    const x = game.bucketX - C.BUCKET_WIDTH / 2;
    ctx.drawImage(s, 0, row * C.BUCKET_HEIGHT, C.BUCKET_WIDTH, C.BUCKET_HEIGHT, x, C.BUCKET_Y, C.BUCKET_WIDTH, C.BUCKET_HEIGHT);
  }

  private drawFeverBuckets(ctx: CanvasRenderingContext2D) {
    const n = C.FEVER_BUCKETS.length;
    const w = (C.WALL_RIGHT - C.WALL_LEFT) / n;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    C.FEVER_BUCKETS.forEach((points, i) => {
      const x = C.WALL_LEFT + i * w;
      ctx.fillStyle = ['#2a6', '#c80', '#c33', '#c80', '#2a6'][i];
      ctx.fillRect(x + 2, C.FEVER_Y, w - 4, 600);
      ctx.fillStyle = '#fff';
      ctx.fillText(points.toLocaleString('es-AR'), x + w / 2, C.FEVER_Y + 20);
    });
  }

  private drawCannon(ctx: CanvasRenderingContext2D, game: Game) {
    const s = this.cannonSprite;
    if (!s) return;
    ctx.save();
    ctx.translate(C.CANNON_X, C.CANNON_Y);
    ctx.rotate(-game.aim);
    ctx.drawImage(s, 0, 0, s.width, CANNON_FRAME_H, -s.width / 2, CANNON_SPRITE_TOP, s.width, CANNON_FRAME_H);
    ctx.restore();
  }

  private drawPopups(ctx: CanvasRenderingContext2D, t: number) {
    const life = 120;
    this.popups = this.popups.filter((p) => t - p.born < life);
    ctx.textAlign = 'center';
    for (const p of this.popups) {
      const k = (t - p.born) / life;
      const big = p.text.startsWith('¡') || p.text.startsWith('+');
      ctx.font = `bold ${big ? 32 : 14}px system-ui, sans-serif`;
      ctx.globalAlpha = 1 - k * k;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(p.text, p.x, p.y - k * 30);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - k * 30);
    }
    ctx.globalAlpha = 1;
  }

  private drawHud(ctx: CanvasRenderingContext2D, game: Game) {
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000';
    const text = (s: string, x: number, y: number, align: CanvasTextAlign, color = '#fff') => {
      ctx.textAlign = align;
      ctx.strokeText(s, x, y);
      ctx.fillStyle = color;
      ctx.fillText(s, x, y);
    };
    text(`Puntos: ${game.score.toLocaleString('es-AR')}`, 120, 28, 'left');
    text(`Bolas: ${game.ballsLeft}`, 40, 90, 'center', '#7f7');
    text(`x${game.multiplier}`, 760, 90, 'center', '#fc4');
    text(`${game.orangesLeft}`, 760, 130, 'center', '#f93');
    ctx.font = 'bold 11px system-ui, sans-serif';
    text('naranjas', 760, 145, 'center', '#f93');

    if (game.phase === 'won' || game.phase === 'lost') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 230, 800, 140);
      ctx.font = 'bold 44px system-ui, sans-serif';
      text(game.phase === 'won' ? '¡Nivel completo!' : 'Sin bolas...', 400, 295, 'center', game.phase === 'won' ? '#fc4' : '#f77');
      ctx.font = 'bold 18px system-ui, sans-serif';
      text(`Puntaje final: ${game.score.toLocaleString('es-AR')} — clic para jugar de nuevo`, 400, 340, 'center');
    }
  }
}

function pegTextColor(c: PegColor) {
  return c === PegColor.Orange ? '#fa4' : c === PegColor.Purple ? '#f6f' : c === PegColor.Green ? '#6f6' : '#9cf';
}
