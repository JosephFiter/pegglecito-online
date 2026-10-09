// Parser de niveles .dat de Peggle (Deluxe y Nights).
// Formato documentado por la comunidad; referencia: PeggleEdit de IntelOrca
// (https://github.com/IntelOrca/PeggleEdit). Implementación propia.
//
// Estructura general:
//   i32 version (Nights = 0x52), u8 (siempre 1), i32 cantidad de entradas
//   cada entrada: i32 magic (1), i32 tipo, datos genéricos, datos del tipo.
// Strings: i16 largo + bytes UTF-8. Ángulos en radianes salvo que se indique.

export const EntryType = {
  Rod: 2,
  Polygon: 3,
  Circle: 5,
  Brick: 6,
  Teleport: 8,
  Emitter: 9,
} as const;

/** Tipo de peg: 1 = azul, 2 = naranja... (ver PegType en el motor). */
export interface PegInfo {
  type: number;
  /** Si es true, el juego puede convertirlo en naranja/verde/violeta al azar. */
  variable: boolean;
  crumble: boolean;
}

export interface Movement {
  /** Forma del movimiento (ver MovementType). */
  type: number;
  reverse: boolean;
  anchorX: number;
  anchorY: number;
  /** Duración de un ciclo, en centésimas de segundo. */
  timePeriod: number;
  offset: number;
  radius1: number;
  radius2: number;
  startPhase: number;
  /** Radianes. */
  moveRotation: number;
  pause1: number;
  pause2: number;
  phase1: number;
  phase2: number;
  postDelayPhase: number;
  maxAngle: number;
  /** Radianes. */
  rotation: number;
  subMovementOffsetX: number;
  subMovementOffsetY: number;
  /** Movimiento anidado (el ancla se mueve siguiendo otro movimiento). */
  subMovement?: MovementLink;
  objectX?: number;
  objectY?: number;
}

/**
 * 0 = sin movimiento, 1 = movimiento propio (en `movement`),
 * otro valor = comparte el movimiento de otro objeto (resuelto en `movement` al terminar de leer).
 */
export interface MovementLink {
  linkId: number;
  movement?: Movement;
}

interface EntryBase {
  collision: boolean;
  visible: boolean;
  canMove: boolean;
  background: boolean;
  foreground: boolean;
  baseObject: boolean;
  ballStopReset: boolean;
  drawSort: boolean;
  drawFloat: boolean;
  shadow: boolean;
  rolly?: number;
  bouncy?: number;
  /** ARGB. */
  solidColor?: number;
  outlineColor?: number;
  image?: string;
  imageDX?: number;
  imageDY?: number;
  /** Radianes. */
  imageRotation?: number;
  id?: string;
  sound?: number;
  logic?: string;
  maxBounceVelocity?: number;
  subId?: number;
  flipperFlags?: number;
  peg?: PegInfo;
  movementLink?: MovementLink;
}

export interface CircleEntry extends EntryBase {
  kind: 'circle';
  x: number;
  y: number;
  radius: number;
}

export interface RodEntry extends EntryBase {
  kind: 'rod';
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface PolygonEntry extends EntryBase {
  kind: 'polygon';
  x: number;
  y: number;
  rotation: number;
  scale: number;
  normalDir: number;
  points: { x: number; y: number }[];
  growType: number;
}

export interface BrickEntry extends EntryBase {
  kind: 'brick';
  x: number;
  y: number;
  /** 5 = recto, cualquier otro = curvo. */
  brickType: number;
  curved: boolean;
  curvePoints: number;
  leftAngle: number;
  rightAngle: number;
  sectorAngle: number;
  width: number;
  length: number;
  angle: number;
  textureFlip: boolean;
}

export interface TeleportEntry extends EntryBase {
  kind: 'teleport';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Objeto que se dibuja/actúa como destino del teletransporte. */
  entry?: LevelEntry;
}

export interface EmitterEntry extends EntryBase {
  kind: 'emitter';
  x: number;
  y: number;
  width: number;
  height: number;
  emitterImage: string;
  emitImage: string;
}

export type LevelEntry =
  | CircleEntry
  | RodEntry
  | PolygonEntry
  | BrickEntry
  | TeleportEntry
  | EmitterEntry;

export interface Level {
  version: number;
  entries: LevelEntry[];
}

const bit = (flags: number, n: number) => (flags & (1 << n)) !== 0;

class Reader {
  private bytes: Uint8Array;
  private view: DataView;
  pos = 0;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  u8() { return this.view.getUint8(this.pos++); }
  i8() { return this.view.getInt8(this.pos++); }
  i16() { const v = this.view.getInt16(this.pos, true); this.pos += 2; return v; }
  i32() { const v = this.view.getInt32(this.pos, true); this.pos += 4; return v; }
  u24() { const v = this.view.getUint16(this.pos, true) | (this.view.getUint8(this.pos + 2) << 16); this.pos += 3; return v; }
  f32() { const v = this.view.getFloat32(this.pos, true); this.pos += 4; return v; }
  str() {
    const len = this.i16();
    const s = new TextDecoder().decode(this.bytes.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }
  /** VariableFloat: un valor fijo, o una expresión en texto. */
  varFloat(): number | string {
    return this.u8() > 0 ? this.f32() : this.str();
  }
}

export function parseLevel(bytes: Uint8Array): Level {
  const r = new Reader(bytes);
  const result = readLevel(r);
  if (r.pos !== bytes.length) throw new Error(`Sobraron ${bytes.length - r.pos} bytes al final del nivel`);
  return result;
}

function readLevel(r: Reader): Level {
  const version = r.i32();
  r.u8();
  const count = r.i32();

  // Los objetos y los movimientos propios comparten una numeración (empieza en 3)
  // que usan los MovementLink para referenciar movimientos de otros objetos.
  const movementsById = new Map<number, Movement>();
  const pendingLinks: MovementLink[] = [];
  let nextId = 2;

  const entries: LevelEntry[] = [];
  for (let i = 0; i < count; i++) {
    nextId++;
    const entry = readEntry(r, version, pendingLinks);
    if (!entry) continue;
    entries.push(entry);
    let link = entry.movementLink;
    while (link && (link.linkId === 0 || link.linkId === 1)) {
      nextId++;
      if (link.movement) movementsById.set(nextId, link.movement);
      link = link.movement?.subMovement;
    }
  }

  for (const link of pendingLinks) link.movement = movementsById.get(link.linkId);

  return { version, entries };
}

function readEntry(r: Reader, version: number, pendingLinks: MovementLink[]): LevelEntry | null {
  const magic = r.i32();
  if (magic === 0) return null;
  if (magic !== 1) throw new Error(`Entrada inválida en offset ${r.pos - 4} (magic ${magic})`);
  const type = r.i32();

  const base = readGeneric(r, version, pendingLinks);

  switch (type) {
    case EntryType.Circle: {
      const fA = r.u8();
      if (version >= 0x52) r.u8();
      let x = 0, y = 0;
      if (bit(fA, 1)) { x = r.f32(); y = r.f32(); }
      return { ...base, kind: 'circle', x, y, radius: r.f32() };
    }
    case EntryType.Rod: {
      const fA = r.u8();
      const ax = r.f32(), ay = r.f32(), bx = r.f32(), by = r.f32();
      if (bit(fA, 0)) r.f32();
      if (bit(fA, 1)) r.f32();
      return { ...base, kind: 'rod', ax, ay, bx, by };
    }
    case EntryType.Polygon: {
      const fA = r.u8();
      const fB = version >= 0x23 ? r.u8() : 0;
      let rotation = 0, scale = 1, normalDir = 0, x = 0, y = 0, growType = 0;
      if (bit(fA, 2)) rotation = r.f32();
      if (bit(fA, 3)) r.f32();
      if (bit(fA, 5)) scale = r.f32();
      if (bit(fA, 1)) normalDir = r.u8();
      if (bit(fA, 4)) { x = r.f32(); y = r.f32(); }
      const n = r.i32();
      const points = [];
      for (let i = 0; i < n; i++) points.push({ x: r.f32(), y: r.f32() });
      if (bit(fB, 0)) r.u8();
      if (bit(fB, 1)) growType = r.i32();
      return { ...base, kind: 'polygon', x, y, rotation, scale, normalDir, points, growType };
    }
    case EntryType.Brick:
      return { ...base, ...readBrick(r, version) };
    case EntryType.Teleport: {
      const fA = r.u8();
      const width = r.i32(), height = r.i32();
      let x = 0, y = 0, entry: LevelEntry | undefined;
      if (bit(fA, 1)) r.i16();
      if (bit(fA, 3)) r.i32();
      if (bit(fA, 5)) r.i32();
      if (bit(fA, 4)) entry = readEntry(r, version, pendingLinks) ?? undefined;
      if (bit(fA, 2)) { x = r.f32(); y = r.f32(); }
      if (bit(fA, 6)) { r.f32(); r.f32(); }
      return { ...base, kind: 'teleport', x, y, width, height, entry };
    }
    case EntryType.Emitter:
      return { ...base, ...readEmitter(r) };
    default:
      throw new Error(`Tipo de entrada desconocido ${type} en offset ${r.pos - 4}`);
  }
}

function readGeneric(r: Reader, version: number, pendingLinks: MovementLink[]): EntryBase {
  const f = version < 0x0f ? r.u24() : r.i32();
  const e: EntryBase = {
    collision: bit(f, 5),
    visible: bit(f, 6),
    canMove: bit(f, 7),
    background: bit(f, 14),
    baseObject: bit(f, 15),
    ballStopReset: bit(f, 20),
    foreground: bit(f, 22),
    drawSort: bit(f, 24),
    drawFloat: bit(f, 28),
    shadow: version >= 0x50 && bit(f, 30),
  };
  if (bit(f, 0)) e.rolly = r.f32();
  if (bit(f, 1)) e.bouncy = r.f32();
  if (bit(f, 4)) r.i32();
  if (bit(f, 8)) e.solidColor = r.i32() >>> 0;
  if (bit(f, 9)) e.outlineColor = r.i32() >>> 0;
  if (bit(f, 10)) e.image = r.str();
  if (bit(f, 11)) e.imageDX = r.f32();
  if (bit(f, 12)) e.imageDY = r.f32();
  if (bit(f, 13)) e.imageRotation = r.f32();
  if (bit(f, 16)) r.i32();
  if (bit(f, 17)) e.id = r.str();
  if (bit(f, 18)) r.i32();
  if (bit(f, 19)) e.sound = r.u8();
  if (bit(f, 21)) e.logic = r.str();
  if (bit(f, 23)) e.maxBounceVelocity = r.f32();
  if (bit(f, 26)) e.subId = r.i32();
  if (bit(f, 27)) e.flipperFlags = r.u8();
  if (bit(f, 2)) {
    const type = r.u8();
    const f2 = r.u8();
    if (bit(f2, 2)) r.i32();
    if (bit(f2, 4)) r.i32();
    if (bit(f2, 5)) r.u8();
    if (bit(f2, 7)) r.u8();
    e.peg = { type, variable: bit(f2, 1), crumble: bit(f2, 3) };
  }
  if (bit(f, 3)) e.movementLink = readMovementLink(r, pendingLinks);
  return e;
}

function readMovementLink(r: Reader, pendingLinks: MovementLink[]): MovementLink {
  const link: MovementLink = { linkId: r.i32() };
  if (link.linkId === 1) link.movement = readMovement(r, pendingLinks);
  else if (link.linkId !== 0) pendingLinks.push(link);
  return link;
}

function readMovement(r: Reader, pendingLinks: MovementLink[]): Movement {
  const shape = r.i8();
  const m: Movement = {
    type: Math.abs(shape),
    reverse: shape < 0,
    anchorX: r.f32(),
    anchorY: r.f32(),
    timePeriod: r.i16(),
    offset: 0, radius1: 0, radius2: 0, startPhase: 0, moveRotation: 0,
    pause1: 0, pause2: 0, phase1: 0, phase2: 0, postDelayPhase: 0, maxAngle: 0,
    rotation: 0, subMovementOffsetX: 0, subMovementOffsetY: 0,
  };
  const f = r.i16();
  if (bit(f, 0)) m.offset = r.i16();
  if (bit(f, 1)) m.radius1 = r.i16();
  if (bit(f, 2)) m.startPhase = r.f32();
  if (bit(f, 3)) m.moveRotation = r.f32();
  if (bit(f, 4)) m.radius2 = r.i16();
  if (bit(f, 5)) m.pause1 = r.i16();
  if (bit(f, 6)) m.pause2 = r.i16();
  if (bit(f, 7)) m.phase1 = r.u8();
  if (bit(f, 8)) m.phase2 = r.u8();
  if (bit(f, 9)) m.postDelayPhase = r.f32();
  if (bit(f, 10)) m.maxAngle = r.f32();
  if (bit(f, 11)) r.f32();
  if (bit(f, 14)) m.rotation = r.f32();
  if (bit(f, 12)) {
    m.subMovementOffsetX = r.f32();
    m.subMovementOffsetY = r.f32();
    m.subMovement = readMovementLink(r, pendingLinks);
  }
  if (bit(f, 13)) { m.objectX = r.f32(); m.objectY = r.f32(); }
  return m;
}

function readBrick(r: Reader, version: number): Omit<BrickEntry, keyof EntryBase> {
  const fA = r.u8();
  const fB = version >= 0x23 ? r.u8() : 0;
  let x = 0, y = 0;
  if (bit(fA, 2)) r.f32();
  if (bit(fA, 3)) r.f32();
  if (bit(fA, 5)) r.f32();
  if (bit(fA, 1)) r.u8();
  if (bit(fA, 4)) { x = r.f32(); y = r.f32(); }
  if (bit(fB, 0)) r.u8();
  if (bit(fB, 1)) r.i32();
  if (bit(fB, 2)) r.i16();

  const fC = r.i16();
  let brickType = 0, curvePoints = 0, leftAngle = 0, rightAngle = 0, sectorAngle = 0, width = 20;
  if (bit(fC, 8)) r.f32();
  if (bit(fC, 9)) r.f32();
  if (bit(fC, 2)) brickType = r.u8();
  if (bit(fC, 3)) curvePoints = r.u8() + 2;
  if (bit(fC, 5)) leftAngle = r.f32();
  if (bit(fC, 6)) { rightAngle = r.f32(); r.f32(); }
  if (bit(fC, 4)) sectorAngle = r.f32();
  if (bit(fC, 7)) width = r.f32();
  const length = r.f32();
  const angle = r.f32();
  r.i32();
  return {
    kind: 'brick', x, y, brickType, curved: brickType !== 5, curvePoints,
    leftAngle, rightAngle, sectorAngle, width, length, angle, textureFlip: bit(fC, 10),
  };
}

function readEmitter(r: Reader): Omit<EmitterEntry, keyof EntryBase> {
  const mainVar = r.i32();
  const fA = r.i16();
  const emitterImage = r.str();
  const width = r.i32();
  const height = r.i32();
  if (mainVar === 2) {
    r.i32(); r.f32(); r.str(); r.u8();
    if (bit(fA, 13)) { r.varFloat(); r.varFloat(); }
  }
  let x = 0, y = 0;
  if (bit(fA, 5)) { x = r.f32(); y = r.f32(); }
  const emitImage = r.str();
  for (let i = 0; i < 3; i++) r.f32(); // emitRate?, ?, rotation
  r.i32(); // maxQuantity
  for (let i = 0; i < 3; i++) r.f32(); // fadeOut, fadeIn, lifeDuration
  r.varFloat(); r.varFloat(); // emitRate, emitAreaMultiplier
  if (bit(fA, 12)) { r.varFloat(); r.varFloat(); r.f32(); }
  if (bit(fA, 7)) { r.varFloat(); r.varFloat(); r.f32(); }
  if (bit(fA, 8)) { r.varFloat(); r.varFloat(); r.varFloat(); }
  if (bit(fA, 9)) r.varFloat();
  if (bit(fA, 10)) { r.varFloat(); r.varFloat(); for (let i = 0; i < 4; i++) r.f32(); }
  if (bit(fA, 11)) for (let i = 0; i < 5; i++) r.f32();
  if (bit(fA, 6)) { r.f32(); r.f32(); }
  return { kind: 'emitter', x, y, width, height, emitterImage, emitImage };
}
