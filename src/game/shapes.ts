// Formas de colisión de los objetos del nivel y choque bola-forma.
import type { BrickEntry, LevelEntry } from '../formats/level.ts';
import { movementAngle, movementPosition } from './movement.ts';

export interface CircleShape {
  type: 'circle';
  x: number;
  y: number;
  r: number;
}

/** Polígono (o polilínea si `closed` es false), con puntos intercalados x,y. */
export interface PolyShape {
  type: 'poly';
  pts: number[];
  closed: boolean;
  /** Círculo envolvente, para descartar rápido. */
  cx: number;
  cy: number;
  br: number;
}

export type Shape = CircleShape | PolyShape;

export interface Contact {
  /** Normal que apunta hacia la bola. */
  nx: number;
  ny: number;
  depth: number;
}

const DEG = Math.PI / 180;

/** Posición del objeto en el tick `t` (con movimiento, si tiene). */
export function entryPosition(e: LevelEntry, t: number): { x: number; y: number } {
  const m = e.movementLink?.movement;
  if (m) return movementPosition(m, t);
  return { x: 'x' in e ? e.x : 0, y: 'y' in e ? e.y : 0 };
}

/** Forma de colisión del objeto en el tick `t`, o null si no colisiona. */
export function entryShape(e: LevelEntry, t: number): Shape | null {
  const solid = e.peg || e.collision;
  if (!solid) return null;
  const p = entryPosition(e, t);
  const m = e.movementLink?.movement;

  switch (e.kind) {
    case 'circle':
      return { type: 'circle', x: p.x, y: p.y, r: e.radius };
    case 'brick':
      return brickShape(e, p.x, p.y, m ? movementAngle(m, t, e.angle) : e.angle);
    case 'polygon': {
      if (e.points.length < 2) return null;
      const rot = m ? movementAngle(m, t, 0) * DEG : 0;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const pts: number[] = [];
      for (const q of e.points) {
        const x = q.x * e.scale, y = q.y * e.scale;
        pts.push(p.x + x * cos - y * sin, p.y + x * sin + y * cos);
      }
      const first = e.points[0], last = e.points[e.points.length - 1];
      const closed = first.x === last.x && first.y === last.y;
      if (closed) pts.length -= 2; // el último punto repite el primero
      return poly(pts, closed);
    }
    case 'rod':
      return poly([e.ax, e.ay, e.bx, e.by], false);
    default:
      return null;
  }
}

/** Ladrillo recto (rectángulo) o curvo (sector de anillo) como polígono. */
export function brickShape(b: BrickEntry, x: number, y: number, angleDeg: number): PolyShape {
  const theta = -angleDeg * DEG;
  const pts: number[] = [];
  if (!b.curved) {
    // El largo va perpendicular a theta.
    const ux = Math.cos(theta + Math.PI / 2), uy = Math.sin(theta + Math.PI / 2);
    const vx = -uy, vy = ux;
    const hl = b.length / 2, hw = b.width / 2;
    for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pts.push(x + ux * hl * a + vx * hw * c, y + uy * hl * a + vy * hw * c);
    }
    return poly(pts, true);
  }
  const inner = b.length, outer = b.length + b.width, mid = inner + b.width / 2;
  const cx = x - mid * Math.cos(theta), cy = y - mid * Math.sin(theta);
  const half = (b.sectorAngle * DEG) / 2;
  const n = Math.max(2, Math.ceil(b.sectorAngle / 6));
  for (let i = 0; i <= n; i++) {
    const a = theta - half + (2 * half * i) / n;
    pts.push(cx + outer * Math.cos(a), cy + outer * Math.sin(a));
  }
  for (let i = n; i >= 0; i--) {
    const a = theta - half + (2 * half * i) / n;
    pts.push(cx + inner * Math.cos(a), cy + inner * Math.sin(a));
  }
  return poly(pts, true);
}

function poly(pts: number[], closed: boolean): PolyShape {
  let cx = 0, cy = 0;
  const n = pts.length / 2;
  for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cy += pts[i + 1]; }
  cx /= n; cy /= n;
  let br = 0;
  for (let i = 0; i < pts.length; i += 2) br = Math.max(br, Math.hypot(pts[i] - cx, pts[i + 1] - cy));
  return { type: 'poly', pts, closed, cx, cy, br };
}

/** Choque de una bola (x, y, r) contra una forma. Devuelve null si no se tocan. */
export function collide(x: number, y: number, r: number, s: Shape): Contact | null {
  if (s.type === 'circle') {
    const dx = x - s.x, dy = y - s.y;
    const d2 = dx * dx + dy * dy, rr = r + s.r;
    if (d2 >= rr * rr) return null;
    const d = Math.sqrt(d2) || 1e-6;
    return { nx: dx / d, ny: dy / d, depth: rr - d };
  }

  const dxb = x - s.cx, dyb = y - s.cy, lim = s.br + r;
  if (dxb * dxb + dyb * dyb >= lim * lim) return null;

  // Punto más cercano sobre los bordes.
  const p = s.pts, n = p.length / 2, edges = s.closed ? n : n - 1;
  let best = Infinity, qx = 0, qy = 0;
  for (let i = 0; i < edges; i++) {
    const j = (i + 1) % n;
    const ax = p[i * 2], ay = p[i * 2 + 1], bx = p[j * 2], by = p[j * 2 + 1];
    const ex = bx - ax, ey = by - ay;
    const len2 = ex * ex + ey * ey;
    let u = len2 > 0 ? ((x - ax) * ex + (y - ay) * ey) / len2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const px = ax + ex * u, py = ay + ey * u;
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    if (d2 < best) { best = d2; qx = px; qy = py; }
  }

  const inside = s.closed && pointInPolygon(x, y, p);
  const d = Math.sqrt(best);
  if (!inside && d >= r) return null;
  let nx = (x - qx) / (d || 1e-6), ny = (y - qy) / (d || 1e-6);
  if (inside) { nx = -nx; ny = -ny; }
  return { nx, ny, depth: inside ? r + d : r - d };
}

function pointInPolygon(x: number, y: number, p: number[]): boolean {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], yi = p[i * 2 + 1], xj = p[j * 2], yj = p[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
