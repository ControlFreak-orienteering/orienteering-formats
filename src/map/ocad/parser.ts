import { BinaryReader } from "./binary-reader.js";
import { readColors } from "./colors.js";
import { readFileHeader } from "./file-header.js";
import { readGeoReference } from "./georef.js";
import { readObject, readObjectIndex } from "./objects.js";
import { readParameterStrings } from "./parameter-strings.js";
import { readSymbol, readSymbolIndex } from "./symbols.js";
import { readColorsV8, readSymbolsAndObjectsV8 } from "./v8.js";
import type { ParsedOcadMap } from "./types.js";

const MIN_SUPPORTED_VERSION = 8;
/** Below this version everything is read by a path of its own, see v8.ts. */
const V8_BELOW = 9;
const MAX_SUPPORTED_VERSION = 2018;

/**
 * Parses an .ocd file into a version-independent `ParsedOcadMap`.
 *
 * Supports OCAD 8, and 10 through 2018. OCAD 8 has its own layout — the
 * colours live in the file header, the symbol and object records use
 * 16-bit fields — and is read by v8.ts, which produces the same
 * `ParsedOcadMap` so nothing downstream needs to know which it was.
 *
 * OCAD 9 sits between the two and is not read: it is rare enough that
 * nobody has put a file in front of this parser, and guessing at which of
 * the two layouts it follows would mis-parse rather than refuse.
 */
export function parseOcadFile(buffer: ArrayBuffer): ParsedOcadMap {
  const reader = new BinaryReader(buffer);
  const warnings: string[] = [];

  const header = readFileHeader(reader);
  if (
    header.version < MIN_SUPPORTED_VERSION ||
    header.version > MAX_SUPPORTED_VERSION ||
    header.version === 9
  ) {
    throw new Error(
      `OCAD file version ${header.version} is not supported yet (this parser handles OCAD 8, and 10 through 2018).`,
    );
  }

  if (header.version < V8_BELOW) {
    const parameterStrings = readParameterStrings(reader, header.stringIndexBlockPos);
    const colors = readColorsV8(reader);
    const { symbols, objects } = readSymbolsAndObjectsV8(
      reader,
      header.symbolIndexBlockPos,
      header.objectIndexBlockPos,
      warnings,
    );
    return {
      version: header.version,
      colors,
      colorsByNumber: new Map(colors.map((c) => [c.number, c])),
      symbols,
      symbolsByNumber: new Map(symbols.map((s) => [s.symNum, s])),
      objects,
      georef: readGeoReference(parameterStrings),
      bounds: computeBounds(objects),
      warnings,
    };
  }

  const parameterStrings = readParameterStrings(reader, header.stringIndexBlockPos);
  const colors = readColors(parameterStrings);
  const colorsByNumber = new Map(colors.map((c) => [c.number, c]));
  const georef = readGeoReference(parameterStrings);

  const symbols = readSymbolIndex(reader, header.symbolIndexBlockPos)
    .map((entry) => {
      try {
        return readSymbol(reader, header.version, entry.filePos, (m) => warnings.push(m));
      } catch (e) {
        warnings.push(`Failed to read symbol at ${entry.filePos}: ${(e as Error).message}`);
        return null;
      }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
  const symbolsByNumber = new Map(symbols.map((s) => [s.symNum, s]));

  const objects = readObjectIndex(reader, header.objectIndexBlockPos)
    .map((entry) => {
      try {
        return readObject(reader, header.version, entry.pos);
      } catch (e) {
        warnings.push(`Failed to read object at ${entry.pos}: ${(e as Error).message}`);
        return null;
      }
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);

  const bounds = computeBounds(objects);

  return {
    version: header.version,
    colors,
    colorsByNumber,
    symbols,
    symbolsByNumber,
    objects,
    georef,
    bounds,
    warnings,
  };
}

function computeBounds(objects: ParsedOcadMap["objects"]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const obj of objects) {
    for (const pt of obj.coordinates) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}
