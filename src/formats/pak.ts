// Parser del formato .pak de PopCap (Peggle, Zuma, Bejeweled...).
// Todo el archivo está XOReado con 0xF7. Estructura (ya des-XOReada):
//   u32 magic 0xBAC04AC0, u32 version (0)
//   repetido: u8 flags (0x80 = fin de tabla), u8 nameLen, name, u32 size, u64 filetime
//   luego los datos de cada archivo concatenados en el mismo orden.
// Funciona igual en Node y en el navegador (solo usa Uint8Array/DataView).

const XOR_KEY = 0xf7;
const MAGIC = 0xbac04ac0;
const FLAG_END = 0x80;

export interface PakEntry {
  /** Ruta con '/' como separador, tal cual figura en el pak (respeta mayúsculas). */
  name: string;
  data: Uint8Array;
}

export function parsePak(input: Uint8Array): PakEntry[] {
  const buf = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) buf[i] = input[i] ^ XOR_KEY;
  const view = new DataView(buf.buffer);

  if (view.getUint32(0, true) !== MAGIC) throw new Error('No es un .pak de PopCap (magic inválido)');
  let pos = 8;

  const table: { name: string; size: number }[] = [];
  const decoder = new TextDecoder('latin1');
  for (;;) {
    const flags = buf[pos++];
    if (flags & FLAG_END) break;
    const nameLen = buf[pos++];
    const name = decoder.decode(buf.subarray(pos, pos + nameLen)).replace(/\\/g, '/');
    pos += nameLen;
    const size = view.getUint32(pos, true);
    pos += 12; // size + filetime
    table.push({ name, size });
  }

  return table.map(({ name, size }) => {
    const data = buf.subarray(pos, pos + size);
    pos += size;
    return { name, data };
  });
}
