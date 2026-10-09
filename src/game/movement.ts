// Cálculo de posición/ángulo de objetos móviles en función del tiempo.
// Basado en el análisis del formato de PeggleEdit; los tiempos están en
// centésimas de segundo (el juego original actualiza a 100 Hz).
import type { Movement } from '../formats/level.ts';

export const MovementType = {
  None: 0,
  VerticalCycle: 1,
  HorizontalCycle: 2,
  Circle: 3,
  HorizontalInfinity: 4,
  VerticalInfinity: 5,
  HorizontalArc: 6,
  VerticalArc: 7,
  Rotate: 8,
  RotateBackAndForth: 9,
  VerticalWrap: 11,
  HorizontalWrap: 12,
  RotateAroundCircle: 13,
  RetraceCircle: 14,
} as const;

const TAU = Math.PI * 2;
const RAD2DEG = 180 / Math.PI;

const xRadius = (m: Movement) => m.radius1;
const yRadius = (m: Movement) => (m.radius2 === 0 ? m.radius1 : m.radius2);

/** Fase del ciclo (0..1 + startPhase) en el instante `t`, respetando las dos pausas. */
function phaseAt(m: Movement, t: number): number {
  const offset = (m.type === MovementType.RetraceCircle ? 0 : m.startPhase) % 1;
  if (m.timePeriod === 0) return offset;

  let ph1 = m.phase1 / 100, pa1 = m.pause1, ph2 = m.phase2 / 100, pa2 = m.pause2;
  if (m.phase1 > m.phase2) [ph1, pa1, ph2, pa2] = [ph2, pa2, ph1, pa1];

  const period = m.timePeriod;
  let rem = t % (period + m.pause1 + m.pause2);
  const stage1 = ph1 * period;
  const stage2 = ph2 * period - stage1;

  if (rem <= stage1) return rem / period + offset;
  rem -= stage1;
  if (rem <= pa1) return ph1 + offset;
  rem -= pa1;
  if (rem <= stage2) return ph1 + rem / period + offset;
  rem -= stage2;
  if (rem <= pa2) return ph2 + offset;
  rem -= pa2;
  return ph2 + rem / period + offset;
}

/** Posición propia de este movimiento (sin contar el sub-movimiento). */
function ownPosition(m: Movement, t: number): { x: number; y: number } {
  if (m.timePeriod === 0) return { x: m.anchorX, y: m.anchorY };

  let phase = phaseAt(m, t);
  const wrap = m.type === MovementType.HorizontalWrap || m.type === MovementType.VerticalWrap;
  if (!m.reverse && !wrap) phase = 1 - phase;

  let dx = 0, dy = 0, a: number;
  switch (m.type) {
    case MovementType.VerticalCycle:
      dy = Math.sin(phase * TAU + Math.PI) * yRadius(m);
      break;
    case MovementType.HorizontalCycle:
      dx = Math.cos(phase * TAU + Math.PI) * xRadius(m);
      break;
    case MovementType.Circle:
    case MovementType.RotateAroundCircle:
      a = phase * TAU;
      dx = Math.cos(a) * xRadius(m);
      dy = Math.sin(a) * yRadius(m);
      break;
    case MovementType.HorizontalInfinity:
      a = phase * TAU;
      dx = Math.sin(a + Math.PI / 2) * xRadius(m);
      dy = Math.sin(2 * a) * yRadius(m) * 0.5;
      break;
    case MovementType.VerticalInfinity:
      a = phase * TAU;
      dx = Math.sin(2 * a) * xRadius(m);
      dy = Math.sin(a + Math.PI / 2) * yRadius(m);
      break;
    case MovementType.HorizontalArc:
      a = phase * TAU;
      dx = Math.cos(a) * xRadius(m);
      dy = -Math.abs(Math.sin(a) * yRadius(m));
      break;
    case MovementType.VerticalArc:
      a = phase * TAU + Math.PI / 2;
      dx = Math.abs(Math.cos(a) * xRadius(m));
      dy = -Math.sin(a) * yRadius(m);
      break;
    case MovementType.HorizontalWrap: {
      const d = (phase * xRadius(m)) % xRadius(m);
      dx = m.reverse ? -d : d;
      break;
    }
    case MovementType.VerticalWrap: {
      const d = (phase * yRadius(m)) % yRadius(m);
      dy = m.reverse ? d : -d;
      break;
    }
    case MovementType.RetraceCircle:
      a = Math.sin(phase * TAU) * Math.PI - m.startPhase * TAU;
      dx = Math.cos(a) * xRadius(m);
      dy = Math.sin(a) * yRadius(m);
      break;
  }

  // Rotación de toda la trayectoria alrededor del ancla.
  const r = -m.moveRotation;
  const cos = Math.cos(r), sin = Math.sin(r);
  return { x: m.anchorX + dx * cos - dy * sin, y: m.anchorY + dx * sin + dy * cos };
}

export function movementPosition(m: Movement, t: number): { x: number; y: number } {
  const own = ownPosition(m, t);
  const sub = m.subMovement?.movement;
  if (!sub) return { x: own.x - m.subMovementOffsetX, y: own.y - m.subMovementOffsetY };
  const s = movementPosition(sub, t);
  return { x: own.x + s.x - m.subMovementOffsetX, y: own.y + s.y - m.subMovementOffsetY };
}

/** Ángulo (en grados, mismo sistema que Brick.angle) tras aplicar el movimiento. */
export function movementAngle(m: Movement, t: number, initialDeg: number): number {
  let phase = phaseAt(m, t);
  if (!m.reverse) phase = 1 - phase;
  const rotDeg = m.rotation * RAD2DEG;
  switch (m.type) {
    case MovementType.Rotate:
      return initialDeg - phase * 360;
    case MovementType.RotateAroundCircle:
      return initialDeg + rotDeg - phase * 360;
    case MovementType.RotateBackAndForth:
      return initialDeg - Math.sin(phase * TAU) * 180;
    case MovementType.RetraceCircle:
      return initialDeg + rotDeg + m.startPhase * 360 - Math.sin(phase * TAU) * 180;
    default:
      return initialDeg;
  }
}
