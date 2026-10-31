/**
 * Reads a map file (OCAD `.ocd` or OpenOrienteering Mapper `.omap`/`.xmap`) and draws it
 * as SVG markup, with what an app needs to place courses on it: the scale, ground metres
 * per map unit and, when the file says, where on earth the map lies.
 *
 * The SVG's user units are the map file's own units, in the orientation ControlFreak
 * draws the map (x to the right, y downwards), which is also how the exchange section of
 * a `.cfpack` gives control positions (see `exchange.ts`). A course drawn in the same
 * `viewBox` therefore lands on the map without any conversion.
 *
 * - OCAD: 1/100 mm on the printed map. The file's Y axis points up, so the drawing
 *   negates Y (see `ocad/render-svg.ts`).
 * - OpenOrienteering Mapper: 1/1000 mm on the printed map, Y already pointing down.
 */

import { projectionForOcadGrid, type MapGeoreference } from "./georeference.js";
import { parseOcadFile } from "./ocad/parser.js";
import { renderMapSvg } from "./ocad/render-svg.js";
import type { ParsedOcadMap } from "./ocad/types.js";
import { renderOmap } from "./omap.js";

/** The map formats this package reads. */
export type MapFileFormat = "ocad" | "omap";

/**
 * Why a map file could not be read.
 *
 * - `unsupported-file`: the file name is not `.ocd`, `.omap` or `.xmap`.
 * - `not-ocad`: an `.ocd` file that is not an OCAD file at all.
 * - `ocad-version`: an OCAD version this package does not read (it reads 8 and
 *   10–2018).
 * - `ocad-unreadable`: an OCAD file that is damaged or cut short.
 * - `omap-unreadable`: an `.omap`/`.xmap` file that is not readable XML of the format.
 */
export type MapErrorCode =
  | "unsupported-file"
  | "not-ocad"
  | "ocad-version"
  | "ocad-unreadable"
  | "omap-unreadable";

/** Thrown by `readMapFile`. Check `code`; each app turns it into its own text. */
export class MapError extends Error {
  /** Why the map could not be read. */
  readonly code: MapErrorCode;

  /** @param code - Why the map could not be read. */
  constructor(code: MapErrorCode) {
    super(code);
    this.name = "MapError";
    this.code = code;
  }
}

/** A drawn map. */
export type MapDrawing = {
  /** Which kind of file it was. */
  format: MapFileFormat;
  /** The SVG content, without the enclosing `<svg>` element. */
  innerMarkup: string;
  /** The `viewBox` that holds the whole map, in map units: "minX minY width height". */
  viewBox: string;
  /** The map scale denominator, e.g. 10000; 15000 when the file has no usable one. */
  scale: number;
  /** Whether `scale` came from the file (false: the 15000 fallback). */
  scaleFromFile: boolean;
  /** Ground metres per map unit, at `scale`. */
  metersPerUnit: number;
  /**
   * Where the map lies on earth, when the file says so in a grid this package can
   * compute with; `null` otherwise.
   */
  georef: MapGeoreference | null;
  /**
   * Parts of the file that were skipped because they could not be read (OCAD only).
   * The rest of the map is still drawn, so these are for diagnosis, not for the user.
   */
  warnings: string[];
};

/** Options for `readMapFile`. */
export type ReadMapOptions = {
  /**
   * Parses XML for `.omap` files. Defaults to the browser's `DOMParser`; pass another
   * (e.g. from `@xmldom/xmldom`) where there is none, such as in Node.
   */
  parseXml?: (xml: string) => Document;
};

/** A scale outside this range is surely not a real one, and the fallback is used. */
const validScale = (n: number) => Number.isFinite(n) && n >= 500 && n <= 200000;

/** The scale used when the file has none. */
const FALLBACK_SCALE = 15000;

/**
 * The map format a file name says, or `null` for a file this package does not read.
 *
 * @param fileName - The file's name, e.g. "Kantorp.ocd".
 */
export function mapFileFormat(fileName: string): MapFileFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".ocd")) return "ocad";
  if (lower.endsWith(".omap") || lower.endsWith(".xmap")) return "omap";
  return null;
}

/**
 * Reads and draws a map file.
 *
 * @param bytes - The file's content.
 * @param fileName - The file's name; its ending says the format.
 * @param options - See `ReadMapOptions`.
 * @returns The drawing and its scale and georeference.
 * @throws MapError when the file cannot be read.
 */
export function readMapFile(
  bytes: ArrayBuffer | Uint8Array,
  fileName: string,
  options: ReadMapOptions = {},
): MapDrawing {
  const format = mapFileFormat(fileName);
  if (!format) throw new MapError("unsupported-file");
  const buffer = toArrayBuffer(bytes);
  return format === "ocad" ? readOcad(buffer) : readOmap(buffer, options);
}

/**
 * The whole map as a standalone SVG document, e.g. to show in an `<img>` or to parse
 * into an element.
 *
 * @param drawing - A drawing from `readMapFile`.
 */
export function mapSvgMarkup(
  drawing: Pick<MapDrawing, "innerMarkup" | "viewBox">,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${drawing.viewBox}">${drawing.innerMarkup}</svg>`;
}

/** The bytes as an ArrayBuffer of their own (a Uint8Array may view part of a larger one). */
function toArrayBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes;
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function readOcad(buffer: ArrayBuffer): MapDrawing {
  let map: ParsedOcadMap;
  try {
    map = parseOcadFile(buffer);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("Not an OCAD file")) throw new MapError("not-ocad");
    if (message.includes("not supported yet"))
      throw new MapError("ocad-version");
    throw new MapError("ocad-unreadable");
  }

  // OCAD map coordinates are in 1/100 mm at the map's own scale.
  const rawScale = map.georef?.mapScale ?? 0;
  const scaleFromFile = validScale(rawScale);
  const scale = scaleFromFile ? rawScale : FALLBACK_SCALE;
  const { innerMarkup, viewBox } = renderMapSvg(map);
  return {
    format: "ocad",
    innerMarkup,
    viewBox,
    scale,
    scaleFromFile,
    metersPerUnit: scale / 100_000,
    georef: ocadGeoreference(map.georef),
    warnings: map.warnings,
  };
}

/**
 * The OCAD file's georeference, if it can be used.
 *
 * A map that was never placed has the section with `r=0` and no grid, and a map can lie
 * in a grid this package does not convert (see `projectionForOcadGrid`). Both give
 * `null`.
 */
function ocadGeoreference(
  georef: ParsedOcadMap["georef"],
): MapGeoreference | null {
  if (!georef || !georef.realWorldCoords) return null;
  const projection = projectionForOcadGrid(georef.gridAndZone);
  if (!projection) return null;
  return {
    easting: georef.easting,
    northing: georef.northing,
    grivationDeg: (georef.grivationRad * 180) / Math.PI,
    projection,
  };
}

function readOmap(buffer: ArrayBuffer, options: ReadMapOptions): MapDrawing {
  let doc: Document;
  try {
    const xml = new TextDecoder().decode(buffer);
    const parse =
      options.parseXml ??
      ((text: string) =>
        new DOMParser().parseFromString(text, "application/xml"));
    doc = parse(xml);
    // Browsers report bad XML as a document with a <parsererror> element.
    if (doc.getElementsByTagName("parsererror").length > 0)
      throw new Error("bad XML");
  } catch {
    throw new MapError("omap-unreadable");
  }
  try {
    const drawing = renderOmap(doc);
    return { format: "omap", ...drawing, warnings: [] };
  } catch {
    throw new MapError("omap-unreadable");
  }
}
