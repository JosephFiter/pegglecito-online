// Acceso a los archivos del juego (extraídos de los .pak en el navegador).
//
// Convenciones de imágenes de PopCap:
//  - El nombre se pide sin extensión; puede ser .png, .jpg, .jp2 o .gif.
//  - El canal alfa suele venir en una imagen aparte: "nombre_.gif" (o _ al principio).
//    Blanco = opaco. Si solo existe la máscara, la imagen es blanca con ese alfa.
import { JpxImage } from 'jpeg2000';
import { parsePak } from '../formats/pak.ts';

const IMAGE_EXTS = ['.png', '.jpg', '.jp2', '.gif'];

export type Image = HTMLCanvasElement;

export class Assets {
  private files = new Map<string, Uint8Array>();
  private images = new Map<string, Promise<Image | null>>();

  /** Agrega un .pak; los archivos de paks posteriores pisan a los anteriores. */
  addPak(bytes: Uint8Array) {
    for (const { name, data } of parsePak(bytes)) this.files.set(name.toLowerCase(), data);
  }

  file(path: string): Uint8Array | undefined {
    return this.files.get(path.toLowerCase().replace(/\\/g, '/'));
  }

  text(path: string): string | undefined {
    const f = this.file(path);
    return f && new TextDecoder('latin1').decode(f);
  }

  list(prefix: string): string[] {
    const p = prefix.toLowerCase();
    return [...this.files.keys()].filter((k) => k.startsWith(p));
  }

  /** Busca un archivo probando extensiones. Devuelve la ruta en minúsculas. */
  private find(base: string, exts: string[]): string | undefined {
    const b = base.toLowerCase();
    return exts.map((e) => b + e).find((p) => this.files.has(p));
  }

  /** Carga una imagen (sin extensión) aplicando su máscara alfa si existe. Cacheada. */
  image(name: string): Promise<Image | null> {
    const key = name.toLowerCase();
    let p = this.images.get(key);
    if (!p) {
      p = this.loadImage(key);
      this.images.set(key, p);
    }
    return p;
  }

  private async loadImage(name: string): Promise<Image | null> {
    const colorPath = this.find(name, IMAGE_EXTS);
    const slash = name.lastIndexOf('/');
    const maskPath =
      this.find(name + '_', IMAGE_EXTS) ??
      this.find(name.slice(0, slash + 1) + '_' + name.slice(slash + 1), IMAGE_EXTS);
    if (!colorPath && !maskPath) return null;

    const color = colorPath ? await decode(colorPath, this.files.get(colorPath)!) : null;
    const mask = maskPath ? await decode(maskPath, this.files.get(maskPath)!) : null;
    const base = color ?? mask!;

    const canvas = document.createElement('canvas');
    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext('2d')!;
    if (color) ctx.drawImage(color, 0, 0);
    else {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (mask) {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const m = toImageData(mask, canvas.width, canvas.height);
      for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = m.data[i];
      ctx.putImageData(img, 0, 0);
    }
    return canvas;
  }
}

async function decode(path: string, data: Uint8Array): Promise<CanvasImageSource & { width: number; height: number }> {
  if (path.endsWith('.jp2')) return decodeJp2(data);
  return createImageBitmap(new Blob([data as BlobPart]));
}

function toImageData(src: CanvasImageSource, w: number, h: number): ImageData {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * La librería jpeg2000 espera un Buffer de Node; le alcanza con estos tres métodos.
 * Al ser subclase, `subarray()` también devuelve un BufferLike.
 */
class BufferLike extends Uint8Array {
  readInt8(o: number) { return (this[o] << 24) >> 24; }
  readUInt16BE(o: number) { return (this[o] << 8) | this[o + 1]; }
  readUInt32BE(o: number) { return ((this[o] << 24) | (this[o + 1] << 16) | (this[o + 2] << 8) | this[o + 3]) >>> 0; }
}

/** JPEG 2000: los navegadores no lo soportan, lo decodificamos en JS. */
function decodeJp2(data: Uint8Array): HTMLCanvasElement {
  const jpx = new JpxImage();
  const cs = codestream(data);
  jpx.parse(new BufferLike(cs.buffer as ArrayBuffer, cs.byteOffset, cs.byteLength));
  const { width, height, componentsCount } = jpx;
  const items = jpx.tiles[0].items as Uint8Array;
  const out = new ImageData(width, height);
  for (let i = 0, j = 0; i < width * height; i++, j += componentsCount) {
    const o = i * 4;
    if (componentsCount >= 3) {
      out.data[o] = items[j];
      out.data[o + 1] = items[j + 1];
      out.data[o + 2] = items[j + 2];
    } else {
      out.data[o] = out.data[o + 1] = out.data[o + 2] = items[j];
    }
    // El 4º canal de los .jp2 de Peggle viene constante; el alfa real está en la máscara "_".
    out.data[o + 3] = 255;
  }
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  c.getContext('2d')!.putImageData(out, 0, 0);
  return c;
}

/** Extrae el codestream J2K ("jp2c") del contenedor JP2/JPX. */
function codestream(data: Uint8Array): Uint8Array {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let p = 0;
  while (p + 8 <= data.length) {
    let len = view.getUint32(p);
    const type = String.fromCharCode(...data.subarray(p + 4, p + 8));
    let hdr = 8;
    if (len === 1) {
      len = Number(view.getBigUint64(p + 8));
      hdr = 16;
    } else if (len === 0) len = data.length - p;
    if (type === 'jp2c') return data.subarray(p + hdr, p + len);
    p += len;
  }
  return data; // ya es un codestream crudo
}
