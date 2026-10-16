/**
 * Builds tiny but structurally complete .ocd files in memory, byte for
 * byte, for the parser tests. Layouts follow OpenOrienteering Mapper's
 * `ocd_types_v9.h`/`v11.h`/`v12.h` (the de-facto reference for the
 * format): a 60-byte header, then one index block each for parameter
 * strings, symbols and objects, followed by the records themselves.
 *
 * Only what the parser reads is modelled; everything else is zero.
 */

export type OcdVersion = 10 | 11 | 12 | 2018;

/** [x, y, xFlags?, yFlags?] in 1/100 mm; flags are OCAD's low-byte bits. */
export type Coord = [x: number, y: number, xFlags?: number, yFlags?: number];

/** A drawing primitive of a point symbol to write. */
export interface ElementSpec {
  type: 1 | 2 | 3 | 4; // line, area, circle, dot
  color: number;
  lineWidth?: number;
  diameter?: number;
  points: Coord[];
}

interface SymbolBase {
  symNum: number;
  description?: string;
  /** Symbol status: 0 normal, 2 hidden. */
  status?: number;
}

/** A map object to write. */
export interface ObjectSpec {
  sym: number;
  /** Object type: 1 point, 2 line, 3 area, 4 unformatted text, 5 formatted text. */
  otp: 1 | 2 | 3 | 4 | 5 | 6;
  coords: Coord[];
  text?: string;
  angleTenths?: number;
  /** Index status: 1 normal, 2 hidden, 3 deleted. */
  status?: 1 | 2 | 3;
  /** Override the coordinate count written to the header (for corrupt-file tests). */
  nItemOverride?: number;
}

class ByteWriter {
  private buf = new Uint8Array(1024);
  private view = new DataView(this.buf.buffer);
  length = 0;

  private ensure(extra: number) {
    if (this.length + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  byte(v: number) {
    this.ensure(1);
    this.view.setUint8(this.length, v & 0xff);
    this.length += 1;
  }
  word(v: number) {
    this.ensure(2);
    this.view.setUint16(this.length, v & 0xffff, true);
    this.length += 2;
  }
  smallInt(v: number) {
    this.ensure(2);
    this.view.setInt16(this.length, v, true);
    this.length += 2;
  }
  integer(v: number) {
    this.ensure(4);
    this.view.setInt32(this.length, v, true);
    this.length += 4;
  }
  cardinal(v: number) {
    this.ensure(4);
    this.view.setUint32(this.length, v >>> 0, true);
    this.length += 4;
  }
  double(v: number) {
    this.ensure(8);
    this.view.setFloat64(this.length, v, true);
    this.length += 8;
  }
  zeros(n: number) {
    this.ensure(n);
    this.length += n; // buffer is zero-initialised
  }
  bytes(data: Uint8Array) {
    this.ensure(data.length);
    this.buf.set(data, this.length);
    this.length += data.length;
  }
  /** OCAD PascalString: length byte + 8-bit chars, padded to `fieldSize`. */
  pascalString(s: string, fieldSize: number) {
    const chars = Array.from(s, (c) => c.charCodeAt(0) & 0xff).slice(0, fieldSize - 1);
    this.byte(chars.length);
    for (const c of chars) this.byte(c);
    this.zeros(fieldSize - 1 - chars.length);
  }
  /** UTF-16LE in a fixed field of `codeUnits` code units, NUL padded. */
  utf16Fixed(s: string, codeUnits: number) {
    let n = 0;
    for (let i = 0; i < s.length && n < codeUnits; i++, n++) this.word(s.charCodeAt(i));
    this.zeros((codeUnits - n) * 2);
  }
  patchCardinal(at: number, v: number) {
    this.view.setUint32(at, v >>> 0, true);
  }
  patchByte(at: number, v: number) {
    this.view.setUint8(at, v & 0xff);
  }
  coord([x, y, xFlags = 0, yFlags = 0]: Coord) {
    this.integer((x << 8) | (xFlags & 0xff));
    this.integer((y << 8) | (yFlags & 0xff));
  }
  toArrayBuffer(): ArrayBuffer {
    return this.buf.buffer.slice(0, this.length);
  }
}

const HEADER_BYTES = 60;
const STRING_INDEX_BYTES = 4 + 256 * 16;
const SYMBOL_INDEX_BYTES = 4 + 256 * 4;
const OBJECT_INDEX_BYTES = 4 + 256 * 40;

type SymbolRecord = { symNum: number; body: (w: ByteWriter) => void };

/**
 * Builds an .ocd file in memory, for tests: add colours, symbols and
 * objects, then call `build()`.
 *
 * @example
 * new OcdFileBuilder(2018).addColor(0, "Black", [0, 0, 0, 100]).addScale(10000).build();
 */
export class OcdFileBuilder {
  private strings: { recordType: number; text: string }[] = [];
  private symbols: SymbolRecord[] = [];
  private objects: ObjectSpec[] = [];
  /** Test hooks: make an index block's "next block" pointer point at itself. */
  selfLinkedIndex: { strings?: boolean; symbols?: boolean; objects?: boolean } = {};

  constructor(readonly version: OcdVersion) {}

  addString(recordType: number, text: string): this {
    this.strings.push({ recordType, text });
    return this;
  }

  /** Convenience: a type-9 color record. Colors are listed front-most first. */
  addColor(number: number, name: string, cmyk: [number, number, number, number]): this {
    const [c, m, y, k] = cmyk;
    return this.addString(9, `${name}\tn${number}\tc${c}\tm${m}\ty${y}\tk${k}`);
  }

  addScale(mapScale: number): this {
    return this.addString(1039, `\tm${mapScale}\tx0\ty0`);
  }

  addPointSymbol(spec: SymbolBase & { elements: ElementSpec[] }): this {
    this.symbols.push({
      symNum: spec.symNum,
      body: (w) => {
        this.symbolHeader(w, spec, 1);
        const els = elementsBytes(spec.elements);
        // DataSize counts 8-byte coordinates, not words: the same unit
        // the reader uses, see readSymbolElements.
        w.word(els.length / 8);
        w.smallInt(0);
        w.bytes(els);
      },
    });
    return this;
  }

  addLineSymbol(
    spec: SymbolBase & {
      lineColor: number;
      lineWidth: number;
      mainLength?: number;
      mainGap?: number;
    },
  ): this {
    this.symbols.push({
      symNum: spec.symNum,
      body: (w) => {
        this.symbolHeader(w, spec, 2);
        w.smallInt(spec.lineColor);
        w.smallInt(spec.lineWidth);
        w.smallInt(0); // line style
        w.smallInt(0); // dist from start
        w.smallInt(0); // dist to end
        w.smallInt(spec.mainLength ?? 0);
        w.smallInt(0); // end length
        w.smallInt(spec.mainGap ?? 0);
        w.smallInt(0); // secondary gap
        w.smallInt(0); // end gap
        w.smallInt(0); // min sym
        w.smallInt(0); // n prim sym
        w.smallInt(0); // prim sym dist
        w.word(0); // double mode
        w.word(0); // double flags
        for (let i = 0; i < 8; i++) w.smallInt(0); // dbl colors/widths/dash
        w.zeros(6);
        w.word(0); // decrease mode
        w.zeros(4);
        w.smallInt(0); // framing color
        w.smallInt(0); // framing width
        w.smallInt(0); // framing style
        for (let i = 0; i < 5; i++) w.word(0); // prim/sec/corner/start/end data sizes
        w.byte(0);
        w.byte(0);
      },
    });
    return this;
  }

  addAreaSymbol(spec: SymbolBase & { fillColor: number; fillOn?: boolean }): this {
    this.symbols.push({
      symNum: spec.symNum,
      body: (w) => {
        this.symbolHeader(w, spec, 3);
        w.integer(0); // border symbol
        w.smallInt(spec.fillColor);
        w.smallInt(0); // hatch mode
        w.smallInt(0); // hatch color
        w.smallInt(0); // hatch line width
        w.smallInt(0); // hatch distance
        w.smallInt(0); // hatch angle 1
        w.smallInt(0); // hatch angle 2
        w.byte(spec.fillOn === false ? 0 : 1);
        w.byte(0); // border on
        if (this.version >= 12) {
          w.byte(0); // structure mode
          w.byte(0); // structure draw
          w.smallInt(0);
          w.smallInt(0);
          w.smallInt(0);
          w.byte(0);
          w.byte(0);
          w.smallInt(0);
          w.smallInt(0);
        } else {
          for (let i = 0; i < 5; i++) w.smallInt(0);
        }
        w.word(0); // structure data size
      },
    });
    return this;
  }

  addTextSymbol(
    spec: SymbolBase & { fontName: string; fontColor: number; fontSizeTenths: number },
  ): this {
    this.symbols.push({
      symNum: spec.symNum,
      body: (w) => {
        this.symbolHeader(w, spec, 4);
        w.pascalString(spec.fontName, 32);
        w.smallInt(spec.fontColor);
        w.smallInt(spec.fontSizeTenths);
        w.smallInt(400); // weight
        w.byte(0); // italic
        w.byte(0);
        w.smallInt(0); // char spacing
        w.smallInt(0); // word spacing
        w.smallInt(0); // alignment (left)
        w.zeros(64); // the tail the reader never looks at
      },
    });
    return this;
  }

  addObject(spec: ObjectSpec): this {
    this.objects.push(spec);
    return this;
  }

  private symbolHeader(w: ByteWriter, spec: SymbolBase, otp: number) {
    w.integer(0); // size (informational)
    w.integer(spec.symNum);
    w.byte(otp);
    w.byte(0); // flags
    w.byte(0); // selected
    w.byte(spec.status ?? 0);
    w.byte(0); // tool
    w.byte(0); // cs mode
    w.byte(0); // cs type
    w.byte(0); // cd flags
    w.integer(0); // extent
    w.cardinal(0); // file pos
    if (this.version <= 10) {
      w.smallInt(0); // group
      w.smallInt(0); // n colors
      w.zeros(28); // colors
      w.pascalString(spec.description ?? "", 32);
      w.zeros(484); // icon
    } else {
      w.byte(0);
      w.byte(0);
      w.smallInt(0); // n colors
      w.zeros(28); // colors
      w.utf16Fixed(spec.description ?? "", 64); // 128 bytes
      w.zeros(484); // icon
      w.zeros(128); // symbol tree group
    }
  }

  private objectRecord(w: ByteWriter, o: ObjectSpec) {
    const text = o.text ?? "";
    // nText counts 8-byte slots; leave room for the NUL terminator.
    const nText = text ? Math.ceil((text.length + 1) / 4) : 0;
    const nItem = o.nItemOverride ?? o.coords.length;
    w.integer(o.sym);
    w.byte(o.otp);
    w.byte(0); // unicode/customer
    w.smallInt(o.angleTenths ?? 0);
    if (this.version <= 11) {
      w.cardinal(nItem);
      w.word(nText);
      w.byte(0); // mark
      w.byte(0); // snapping mark
      w.integer(-1); // color
      w.smallInt(0); // line width
      w.smallInt(0); // diam flags
      w.integer(0); // reserved / server object id
      w.integer(0); // height (V11)
      w.integer(0); // reserved
      w.integer(0); // height (V10)
    } else {
      w.integer(-1); // color
      w.smallInt(0); // line width
      w.smallInt(0); // diam flags
      w.integer(0); // server object id
      w.integer(0); // height
      w.double(0); // creation date
      w.cardinal(0); // multi-representation id
      w.double(0); // modification date
      w.cardinal(nItem);
      w.word(nText);
      w.word(0); // object string length
      w.word(0); // database string length
      w.byte(0); // object string type
      w.byte(0);
    }
    for (const c of o.coords) w.coord(c);
    if (nText > 0) w.utf16Fixed(text, nText * 4);
  }

  build(): ArrayBuffer {
    const w = new ByteWriter();

    // --- header
    w.word(0x0cad);
    w.byte(0); // file type
    w.byte(0); // file status
    w.word(this.version);
    w.byte(0); // sub version
    w.byte(0); // sub-sub version
    const symbolIndexPosAt = w.length;
    w.cardinal(0);
    const objectIndexPosAt = w.length;
    w.cardinal(0);
    w.integer(0); // offline sync serial
    w.integer(0); // current file version
    w.cardinal(0);
    w.cardinal(0);
    const stringIndexPosAt = w.length;
    w.cardinal(0);
    w.zeros(HEADER_BYTES - w.length);

    // --- parameter strings: index block, then the strings
    const stringIndexPos = w.length;
    w.patchCardinal(stringIndexPosAt, stringIndexPos);
    w.cardinal(this.selfLinkedIndex.strings ? stringIndexPos : 0);
    const stringEntryAt = w.length;
    w.zeros(256 * 16);
    this.strings.slice(0, 256).forEach((s, i) => {
      const bytes = new TextEncoder().encode(s.text);
      const pos = w.length;
      w.bytes(bytes);
      w.byte(0);
      const at = stringEntryAt + i * 16;
      w.patchCardinal(at, pos);
      w.patchCardinal(at + 4, bytes.length + 1);
      w.patchCardinal(at + 8, s.recordType);
    });

    // --- symbols
    const symbolIndexPos = w.length;
    w.patchCardinal(symbolIndexPosAt, symbolIndexPos);
    w.cardinal(this.selfLinkedIndex.symbols ? symbolIndexPos : 0);
    const symbolEntryAt = w.length;
    w.zeros(256 * 4);
    this.symbols.slice(0, 256).forEach((s, i) => {
      const pos = w.length;
      s.body(w);
      w.patchCardinal(symbolEntryAt + i * 4, pos);
    });

    // --- objects
    const objectIndexPos = w.length;
    w.patchCardinal(objectIndexPosAt, objectIndexPos);
    w.cardinal(this.selfLinkedIndex.objects ? objectIndexPos : 0);
    const objectEntryAt = w.length;
    w.zeros(256 * 40);
    this.objects.slice(0, 256).forEach((o, i) => {
      const pos = w.length;
      this.objectRecord(w, o);
      const at = objectEntryAt + i * 40;
      w.patchCardinal(at + 16, pos); // after the 16-byte bounding rect
      w.patchCardinal(at + 20, w.length - pos);
      w.patchCardinal(at + 24, o.sym);
      w.patchByte(at + 28, o.otp); // object type
      w.patchByte(at + 30, o.status ?? 1); // status: 1 normal, 2 hidden, 3 deleted
    });

    return w.toArrayBuffer();
  }
}

function elementsBytes(elements: ElementSpec[]): Uint8Array {
  const w = new ByteWriter();
  for (const el of elements) {
    w.smallInt(el.type);
    w.word(0); // flags
    w.smallInt(el.color);
    w.smallInt(el.lineWidth ?? 0);
    w.smallInt(el.diameter ?? 0);
    w.smallInt(el.points.length);
    w.cardinal(0);
    for (const p of el.points) w.coord(p);
  }
  return new Uint8Array(w.toArrayBuffer());
}

/** Every version the builder writes, for tests that run on each. */
export const ALL_VERSIONS: OcdVersion[] = [10, 11, 12, 2018];
