/**
 * OCAD 8: maps from before the format the rest of this folder reads.
 *
 * The files are still around. A club map drawn in 2003 stays in its OCAD 8
 * file until someone opens it in a newer program, and if nobody does, the
 * file is still the only one there is. The format is documented and read
 * by, among others, OpenOrienteering Mapper; the record layouts here follow
 * its description of the format (src/fileformats/ocd_types_v8.h) and were
 * checked against a real file.
 *
 * Three things differ, and they are why a path of its own is needed:
 *
 *  - The colours live in the file header, not as parameter strings. An
 *    OCAD 8 file has no record type 9 at all.
 *  - The symbol header is shorter and has 16-bit fields where newer files
 *    have 32. The symbol number carries one decimal instead of three.
 *  - The object index has 24 bytes per entry instead of 40, and an
 *    object's text is single-byte unless the object says otherwise.
 *
 * What does *not* differ is left unchanged: the packing of coordinates,
 * the symbols' drawing primitives and the line symbols' body are the same
 * byte for byte, and are read with the same code as newer files.
 */

import { BinaryReader } from "./binary-reader.js";
import { readOcadPoints } from "./coords.js";
import { cmykToRgb } from "./colors.js";
import { readSymbolElements } from "./elements.js";
import type {
  AreaSymbol,
  LineSymbol,
  MapObject,
  OcadColor,
  OcadSymbol,
  ObjectKind,
  PointSymbol,
  TextSymbol,
} from "./types.js";

/** The file header's symbol header, where the colours live. It follows
 * directly after the header's eleven 32-bit fields. */
const SYMBOL_HEADER_POS = 48;
const COLOR_INFO_POS = SYMBOL_HEADER_POS + 24;
const COLOR_INFO_BYTES = 72;
const MAX_COLORS = 256;

/** CMYK in OCAD 8 is given in half percent: 200 is full coverage. */
const CMYK_SCALE = 2;

/** The symbol header's length: the fields, the colour list, the description and the icon. */
const SYMBOL_BASE_BYTES = 348;

/** An object index holds 256 entries of 24 bytes, after the block's link. */
const OBJECT_INDEX_ENTRY_BYTES = 24;

const KIND_BY_TYPE: Record<number, ObjectKind | undefined> = {
  1: "point",
  2: "line",
  3: "area",
  4: "text",
};

/**
 * The symbol number as the rest of the reader counts it.
 *
 * OCAD 8 puts one decimal in the number (1010 means 101.0), newer files
 * three (101000). Converting it here spares everything outside this file
 * from knowing there were two ways.
 */
function symbolNumberFromV8(raw: number): number {
  return Math.floor(raw / 10) * 1000 + (raw % 10) * 100;
}

function pascalString(reader: BinaryReader, totalBytes: number): string {
  const length = reader.byte();
  let out = "";
  for (let i = 0; i < totalBytes - 1; i++) {
    const c = reader.byte();
    if (i < length && c !== 0) out += String.fromCharCode(c);
  }
  return out.trim();
}

/**
 * The colour table from an OCAD 8 file header.
 *
 * @param reader - A reader over the whole file.
 * @returns The colours, in the same order convention as newer files.
 */
export function readColorsV8(reader: BinaryReader): OcadColor[] {
  const colors: OcadColor[] = [];
  reader.push(SYMBOL_HEADER_POS);
  const count = Math.min(reader.word(), MAX_COLORS);
  reader.pop();

  for (let i = 0; i < count; i++) {
    const at = COLOR_INFO_POS + i * COLOR_INFO_BYTES;
    if (at + COLOR_INFO_BYTES > reader.length) break;
    reader.push(at);
    try {
      const number = reader.word();
      reader.word(); // reserverat
      const cmyk: [number, number, number, number] = [
        reader.byte() / CMYK_SCALE,
        reader.byte() / CMYK_SCALE,
        reader.byte() / CMYK_SCALE,
        reader.byte() / CMYK_SCALE,
      ];
      const name = pascalString(reader, 32);
      const [r, g, b] = cmykToRgb(cmyk);
      // The same order convention as newer files: the first defined
      // colour is the one printed last, that is, on top.
      colors.push({ number, name, cmyk, rgb: `rgb(${r}, ${g}, ${b})`, order: i });
    } finally {
      reader.pop();
    }
  }
  return colors;
}

/** Symbol index: a block of 256 file positions, as in newer files. */
function symbolPositions(reader: BinaryReader, firstBlockPos: number): number[] {
  const BLOCK_BYTES = 4 + 256 * 4;
  const positions: number[] = [];
  const visited = new Set<number>();
  let blockPos = firstBlockPos;
  while (blockPos > 0 && blockPos <= reader.length - BLOCK_BYTES && !visited.has(blockPos)) {
    visited.add(blockPos);
    reader.push(blockPos);
    const next = reader.integer();
    for (let i = 0; i < 256; i++) {
      const pos = reader.integer();
      if (pos > 0 && pos < reader.length) positions.push(pos);
    }
    reader.pop();
    blockPos = next;
  }
  return positions;
}

function readSymbolV8(reader: BinaryReader, filePos: number): OcadSymbol | null {
  reader.push(filePos);
  try {
    reader.word(); // record length
    const rawNumber = reader.word();
    const type = reader.word();
    reader.byte(); // type2
    reader.byte(); // flaggor
    reader.word(); // utbredning
    reader.byte(); // vald
    const status = reader.byte();
    reader.skip(4); // reserverat
    reader.integer(); // file position
    reader.skip(32); // colour list
    const description = pascalString(reader, 32);
    reader.skip(264); // ikon

    const symNum = symbolNumberFromV8(rawNumber);
    const base = {
      symNum,
      number: `${Math.floor(symNum / 1000)}.${symNum % 1000}`,
      description,
      // Status 2 is hidden, as in newer files.
      hidden: status === 2,
    };

    switch (type) {
      case 1:
        return readPointSymbolV8(reader, base);
      case 2:
        return readLineSymbolV8(reader, base);
      case 3:
        return readAreaSymbolV8(reader, base);
      case 4:
        return readTextSymbolV8(reader, base);
      default:
        return { kind: "unsupported", ...base };
    }
  } catch {
    return null;
  } finally {
    reader.pop();
  }
}

type BaseFields = { symNum: number; number: string; description: string; hidden: boolean };

function readPointSymbolV8(reader: BinaryReader, base: BaseFields): PointSymbol {
  const dataSize = reader.word();
  reader.word(); // reserverat
  return { kind: "point", ...base, elements: readSymbolElements(reader, dataSize) };
}

/** The line symbol's body is unchanged since OCAD 8: the same fields in the
 * same order as symbols.ts reads for newer files. */
function readLineSymbolV8(reader: BinaryReader, base: BaseFields): LineSymbol {
  const lineColor = reader.word();
  const lineWidth = reader.word();
  reader.word(); // line style
  reader.smallInt(); // distance from start
  reader.smallInt(); // distance to end
  const mainLength = reader.smallInt();
  const endLength = reader.smallInt();
  const mainGap = reader.smallInt();
  const secondaryGap = reader.smallInt();
  const endGap = reader.smallInt();
  reader.smallInt(); // minimum length of a symbol-decorated line
  const primaryCount = reader.smallInt();
  const primaryDistance = reader.smallInt();

  const dblMode = reader.word();
  const dblFlags = reader.word();
  const dblFillColor = reader.word();
  const dblLeftColor = reader.word();
  const dblRightColor = reader.word();
  const dblWidth = reader.smallInt();
  const dblLeftWidth = reader.smallInt();
  const dblRightWidth = reader.smallInt();
  reader.smallInt(); // dubbellinjens streck
  reader.smallInt(); // double line gap
  reader.skip(6); // background colour (V11) and reserved
  reader.word(); // tapering
  reader.skip(4); // avsmalningens parametrar
  const frColor = reader.word();
  const frWidth = reader.smallInt();
  reader.word(); // ramstil
  const primDataSize = reader.word();
  const secDataSize = reader.word();
  const cornerDataSize = reader.word();
  const startDataSize = reader.word();
  const endDataSize = reader.word();
  reader.byte();
  reader.byte();

  // The decorations along the line (a cliff's tags, a fence's ticks, a
  // power line's pylons). Unknown primitives in them are not reported, as
  // elsewhere in line symbols. The secondary symbols (between the primary
  // ones) are read past: they are rare and not drawn.
  const primary = readSymbolElements(reader, primDataSize);
  readSymbolElements(reader, secDataSize);
  const corner = readSymbolElements(reader, cornerDataSize);
  const start = readSymbolElements(reader, startDataSize);
  const end = readSymbolElements(reader, endDataSize);
  const decorations =
    primary.length || corner.length || start.length || end.length
      ? { primary, primaryCount, primaryDistance, corner, start, end }
      : undefined;

  return {
    kind: "line",
    ...base,
    lineColor,
    lineWidth,
    dashed: { mainLength, mainGap, secondaryGap, endLength, endGap },
    ...(decorations ? { decorations } : {}),
    ...(dblMode > 0
      ? {
          doubleLine: {
            mode: dblMode,
            fillColor: dblFillColor,
            fillOn: (dblFlags & 0x01) !== 0,
            leftColor: dblLeftColor,
            rightColor: dblRightColor,
            width: dblWidth,
            leftWidth: dblLeftWidth,
            rightWidth: dblRightWidth,
          },
        }
      : {}),
    ...(frWidth > 0 ? { framing: { color: frColor, width: frWidth } } : {}),
  };
}

/** The area symbol differs in two places: the fill flag is in a field of
 * its own before the body, and there is no border symbol number. */
function readAreaSymbolV8(reader: BinaryReader, base: BaseFields): AreaSymbol {
  reader.word(); // reserverat (tidigare ytflaggor)
  const fillOn = reader.word() !== 0;
  const fillColor = reader.word();
  const hatchMode = reader.word();
  const hatchColor = reader.word();
  const hatchLineWidth = reader.word();
  const hatchDistance = reader.word();
  const hatchAngle1Deg = reader.smallInt() / 10;
  const hatchAngle2Deg = reader.smallInt() / 10;
  reader.byte(); // fill (from V9)
  reader.byte(); // border (from V9)
  const structureMode = reader.byte();
  reader.byte(); // structure draw mode (from V12)
  const cellWidth = reader.word();
  const cellHeight = reader.word();
  const structureAngleDeg = reader.smallInt() / 10;
  reader.word(); // reserverat
  const dataSize = reader.word();
  const elements = readSymbolElements(reader, dataSize);

  return {
    kind: "area",
    ...base,
    fillColor,
    fillOn,
    hatchMode,
    hatchColor,
    hatchLineWidth,
    hatchDistance,
    hatchAngle1Deg,
    hatchAngle2Deg,
    borderSymbolNumber: 0,
    elements,
    ...(structureMode > 0
      ? { structure: { mode: structureMode, cellWidth, cellHeight, angleDeg: structureAngleDeg } }
      : {}),
  };
}

function readTextSymbolV8(reader: BinaryReader, base: BaseFields): TextSymbol {
  const fontName = pascalString(reader, 32);
  const fontColor = reader.word();
  const fontSize = reader.word();
  const weight = reader.word();
  const italic = reader.byte() !== 0;
  reader.byte(); // character set (OCAD 8 only)
  reader.word(); // character spacing
  reader.word(); // word spacing
  const alignment = reader.word();

  return {
    kind: "text",
    ...base,
    fontName,
    fontColor,
    fontSize,
    bold: weight > 400,
    italic,
    alignmentHorizontal:
      (alignment & 0x03) === 1 ? "center" : (alignment & 0x03) === 2 ? "right" : "left",
  };
}

/** Object index: 24 bytes per entry, and no status field; an empty slot is
 * recognised by having no symbol. */
function objectPositions(reader: BinaryReader, firstBlockPos: number): number[] {
  const BLOCK_BYTES = 4 + 256 * OBJECT_INDEX_ENTRY_BYTES;
  const positions: number[] = [];
  const visited = new Set<number>();
  let blockPos = firstBlockPos;
  while (blockPos > 0 && blockPos <= reader.length - BLOCK_BYTES && !visited.has(blockPos)) {
    visited.add(blockPos);
    reader.push(blockPos);
    const next = reader.integer();
    for (let i = 0; i < 256; i++) {
      reader.skip(16); // omslutande rektangel
      const pos = reader.integer();
      reader.word(); // record length
      const symbol = reader.smallInt();
      if (pos > 0 && pos < reader.length && symbol > 0) positions.push(pos);
    }
    reader.pop();
    blockPos = next;
  }
  return positions;
}

function readObjectV8(reader: BinaryReader, filePos: number): MapObject | null {
  reader.push(filePos);
  try {
    const rawSymbol = reader.smallInt();
    const otp = reader.byte();
    const unicode = reader.byte() !== 0;
    const nItem = reader.word();
    const nText = reader.word();
    const angleRaw = reader.smallInt();
    reader.word(); // reserverat
    reader.integer(); // reserved
    reader.skip(16); // reserved string

    const kind = KIND_BY_TYPE[otp];
    if (!kind) return null;
    if ((nItem + nText) * 8 > reader.remaining) return null;

    const coordinates = readOcadPoints(reader, nItem);
    // The text is in nText coordinate slots of 8 bytes. Single-byte unless
    // the object itself says it is Unicode.
    const text = reader.ocadText(nText * (unicode ? 4 : 8), unicode);

    return {
      symNum: symbolNumberFromV8(rawSymbol),
      kind,
      angle: angleRaw / 10,
      color: -1,
      coordinates,
      text,
    };
  } catch {
    return null;
  } finally {
    reader.pop();
  }
}

/**
 * The symbols and objects in an OCAD 8 file. The colours are read on their
 * own, see `readColorsV8`.
 */
export function readSymbolsAndObjectsV8(
  reader: BinaryReader,
  symbolIndexBlockPos: number,
  objectIndexBlockPos: number,
  warnings: string[],
): { symbols: OcadSymbol[]; objects: MapObject[] } {
  const symbols: OcadSymbol[] = [];
  for (const pos of symbolPositions(reader, symbolIndexBlockPos)) {
    const symbol = readSymbolV8(reader, pos);
    if (symbol) symbols.push(symbol);
    else warnings.push(`Failed to read symbol at ${pos}`);
  }

  const objects: MapObject[] = [];
  for (const pos of objectPositions(reader, objectIndexBlockPos)) {
    const object = readObjectV8(reader, pos);
    if (object) objects.push(object);
  }

  return { symbols, objects };
}
