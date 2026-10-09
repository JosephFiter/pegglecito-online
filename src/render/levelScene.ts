// Dibuja un nivel (fondo, pegs, ladrillos, decorados) en un canvas de 800x600.
import type { Assets, Image } from '../assets/assets.ts';
import type { BrickEntry, Level, LevelEntry } from '../formats/level.ts';
import { movementAngle, movementPosition } from '../game/movement.ts';
import { assignPegColors, type PegColor } from '../game/pegs.ts';

/** Las coordenadas del nivel están desplazadas respecto de la pantalla de 800x600. */
export const BOARD_OFFSET_X = 73;
export const BOARD_OFFSET_Y = 43;

const PEG_SPRITE = 20; // celdas de 20x20 en ballpeg (azul, naranja, violeta, verde; x2 encendidos)
const BRICK_SPRITE_H = 20;

export class LevelScene {
  private background: Image | null = null;
  private pegSprite: Image | null = null;
  private brickSprite: Image | null = null;
  private entryImages = new Map<LevelEntry, Image>();
  private colors = new Map<LevelEntry, PegColor>();
  private level: Level;
  private assets: Assets;
  private name: string;

  constructor(level: Level, assets: Assets, name: string) {
    this.level = level;
    this.assets = assets;
    this.name = name;
  }

  async load(seed: number) {
    const a = this.assets;
    [this.background, this.pegSprite, this.brickSprite] = await Promise.all([
      a.image(`levels/${this.name}`),
      a.image('images/game/ballpeg'),
      a.image('images/game/brick'),
    ]);
    await Promise.all(
      this.level.entries.map(async (e) => {
        if (!e.image || e.kind === 'emitter') return;
        const img = (await a.image(e.image)) ?? (await a.image(`images/levels/${e.image}`));
        if (img) this.entryImages.set(e, img);
      }),
    );
    this.setSeed(seed);
  }

  setSeed(seed: number) {
    const pegs = this.level.entries.filter((e) => e.peg);
    const colors = assignPegColors(pegs.map((e) => e.peg!.variable), seed);
    this.colors = new Map(pegs.map((e, i) => [e, colors[i]]));
  }

  /** `t` en centésimas de segundo. */
  draw(ctx: CanvasRenderingContext2D, t: number) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 800, 600);
    if (this.background) {
      const bg = this.background;
      ctx.drawImage(bg, 400 - bg.width / 2, 300 - bg.height / 2);
    }

    ctx.save();
    ctx.translate(BOARD_OFFSET_X, BOARD_OFFSET_Y);
    const entries = this.level.entries;
    for (const e of entries) if (e.background) this.drawEntry(ctx, e, t);
    for (const e of entries) if (!e.background && !e.foreground) this.drawEntry(ctx, e, t);
    for (const e of entries) if (e.foreground) this.drawEntry(ctx, e, t);
    ctx.restore();
  }

  private drawEntry(ctx: CanvasRenderingContext2D, e: LevelEntry, t: number) {
    const m = e.movementLink?.movement;
    const pos = m ? movementPosition(m, t) : { x: 'x' in e ? e.x : 0, y: 'y' in e ? e.y : 0 };

    const img = this.entryImages.get(e);
    if (img && e.visible) {
      ctx.save();
      ctx.translate(pos.x + (e.imageDX ?? 0), pos.y + (e.imageDY ?? 0));
      ctx.rotate(-(e.imageRotation ?? 0));
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    }

    if (e.kind === 'circle' && e.peg) this.drawPeg(ctx, pos.x, pos.y, e.radius, this.colors.get(e) ?? 0);
    else if (e.kind === 'brick' && e.peg) {
      const angle = m ? movementAngle(m, t, e.angle) : e.angle;
      this.drawBrick(ctx, e, pos.x, pos.y, angle, this.colors.get(e) ?? 0);
    }
  }

  private drawPeg(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: PegColor) {
    const s = this.pegSprite;
    if (!s) return;
    ctx.drawImage(s, 0, color * PEG_SPRITE, PEG_SPRITE, PEG_SPRITE, x - r, y - r, r * 2, r * 2);
  }

  private drawBrick(ctx: CanvasRenderingContext2D, b: BrickEntry, x: number, y: number, angleDeg: number, color: PegColor) {
    const s = this.brickSprite;
    const theta = (-angleDeg * Math.PI) / 180;
    ctx.save();
    if (!b.curved) {
      // Recto: rectángulo de length x width, rotado.
      ctx.translate(x, y);
      ctx.rotate(theta + Math.PI / 2);
      if (s) ctx.drawImage(s, 0, color * BRICK_SPRITE_H, s.width, BRICK_SPRITE_H, -b.length / 2, -b.width / 2, b.length, b.width);
      ctx.restore();
      return;
    }

    // Curvo: sector de anillo. (x,y) es el punto medio del grosor del ladrillo.
    const inner = b.length;
    const outer = b.length + b.width;
    const mid = inner + b.width / 2;
    const cx = x - mid * Math.cos(theta);
    const cy = y - mid * Math.sin(theta);
    const half = (b.sectorAngle * Math.PI) / 360;

    if (s) {
      // La textura se dibuja en franjas finas a lo largo del arco, recortada a la forma exacta.
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
        ctx.drawImage(
          s, srcW * i, color * BRICK_SPRITE_H, srcW, BRICK_SPRITE_H,
          -sliceLen / 2, -b.width / 2, sliceLen, b.width,
        );
        ctx.restore();
      }
    }
    ctx.restore();
  }
}
