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
import { type MapGeoreference } from "./georeference.js";
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
export type MapErrorCode = "unsupported-file" | "not-ocad" | "ocad-version" | "ocad-unreadable" | "omap-unreadable";
/** Thrown by `readMapFile`. Check `code`; each app turns it into its own text. */
export declare class MapError extends Error {
    /** Why the map could not be read. */
    readonly code: MapErrorCode;
    /** @param code - Why the map could not be read. */
    constructor(code: MapErrorCode);
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
/**
 * The map format a file name says, or `null` for a file this package does not read.
 *
 * @param fileName - The file's name, e.g. "Kantorp.ocd".
 */
export declare function mapFileFormat(fileName: string): MapFileFormat | null;
/**
 * Reads and draws a map file.
 *
 * @param bytes - The file's content.
 * @param fileName - The file's name; its ending says the format.
 * @param options - See `ReadMapOptions`.
 * @returns The drawing and its scale and georeference.
 * @throws MapError when the file cannot be read.
 */
export declare function readMapFile(bytes: ArrayBuffer | Uint8Array, fileName: string, options?: ReadMapOptions): MapDrawing;
/**
 * The whole map as a standalone SVG document, e.g. to show in an `<img>` or to parse
 * into an element.
 *
 * @param drawing - A drawing from `readMapFile`.
 */
export declare function mapSvgMarkup(drawing: Pick<MapDrawing, "innerMarkup" | "viewBox">): string;
