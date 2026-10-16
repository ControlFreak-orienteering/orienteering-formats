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
import { projectionForOcadGrid } from "./georeference.js";
import { parseOcadFile } from "./ocad/parser.js";
import { renderMapSvg } from "./ocad/render-svg.js";
import { renderOmap } from "./omap.js";
/** Thrown by `readMapFile`. Check `code`; each app turns it into its own text. */
export class MapError extends Error {
    /** Why the map could not be read. */
    code;
    /** @param code - Why the map could not be read. */
    constructor(code) {
        super(code);
        this.name = "MapError";
        this.code = code;
    }
}
/** A scale outside this range is surely not a real one, and the fallback is used. */
const validScale = (n) => Number.isFinite(n) && n >= 500 && n <= 200000;
/** The scale used when the file has none. */
const FALLBACK_SCALE = 15000;
/**
 * The map format a file name says, or `null` for a file this package does not read.
 *
 * @param fileName - The file's name, e.g. "Kantorp.ocd".
 */
export function mapFileFormat(fileName) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".ocd"))
        return "ocad";
    if (lower.endsWith(".omap") || lower.endsWith(".xmap"))
        return "omap";
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
export function readMapFile(bytes, fileName, options = {}) {
    const format = mapFileFormat(fileName);
    if (!format)
        throw new MapError("unsupported-file");
    const buffer = toArrayBuffer(bytes);
    return format === "ocad" ? readOcad(buffer) : readOmap(buffer, options);
}
/**
 * The whole map as a standalone SVG document, e.g. to show in an `<img>` or to parse
 * into an element.
 *
 * @param drawing - A drawing from `readMapFile`.
 */
export function mapSvgMarkup(drawing) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${drawing.viewBox}">${drawing.innerMarkup}</svg>`;
}
/** The bytes as an ArrayBuffer of their own (a Uint8Array may view part of a larger one). */
function toArrayBuffer(bytes) {
    if (bytes instanceof ArrayBuffer)
        return bytes;
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
function readOcad(buffer) {
    let map;
    try {
        map = parseOcadFile(buffer);
    }
    catch (e) {
        const message = e instanceof Error ? e.message : "";
        if (message.includes("Not an OCAD file"))
            throw new MapError("not-ocad");
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
function ocadGeoreference(georef) {
    if (!georef || !georef.realWorldCoords)
        return null;
    const projection = projectionForOcadGrid(georef.gridAndZone);
    if (!projection)
        return null;
    return {
        easting: georef.easting,
        northing: georef.northing,
        grivationDeg: (georef.grivationRad * 180) / Math.PI,
        projection,
    };
}
function readOmap(buffer, options) {
    let doc;
    try {
        const xml = new TextDecoder().decode(buffer);
        const parse = options.parseXml ??
            ((text) => new DOMParser().parseFromString(text, "application/xml"));
        doc = parse(xml);
        // Browsers report bad XML as a document with a <parsererror> element.
        if (doc.getElementsByTagName("parsererror").length > 0)
            throw new Error("bad XML");
    }
    catch {
        throw new MapError("omap-unreadable");
    }
    try {
        const drawing = renderOmap(doc);
        return { format: "omap", ...drawing, warnings: [] };
    }
    catch {
        throw new MapError("omap-unreadable");
    }
}
