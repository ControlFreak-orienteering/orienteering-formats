/**
 * A parsed OpenOrienteering Mapper map (.omap / .xmap) as plain data: colours,
 * symbols and objects, the way `ParsedOcadMap` gives an OCAD map. It is for apps
 * that compare or analyse a map; `renderOmap` draws the same file as SVG.
 *
 * All measures are in the file's own units (1/1000 mm on the printed map, y down).
 */
import type { MapGeoreference } from "./georeference.js";
/** One vertex of an object's path, flags as in `<coords>` of the file. */
export type OmapModelPoint = {
    x: number;
    y: number;
    /** Starts a cubic Bezier; the next two points are its control points. */
    curveStart: boolean;
    /** Closes its sub-path. */
    closePoint: boolean;
    /** Ends its sub-path; the next point starts a new one (an area's hole). */
    holePoint: boolean;
};
/** A colour of the map's colour table. */
export type OmapModelColor = {
    /** The number symbols refer to the colour by (its `priority`). */
    index: number;
    name: string;
    /** The colour on screen, as `rgb(r, g, b)`. */
    rgb: string;
    /** Paint order; 0 is the frontmost colour. */
    priority: number;
};
/** The basic kind of a symbol. */
export type OmapModelSymbolKind = "point" | "line" | "area" | "text" | "combined";
/** A symbol of the map's symbol set. */
export type OmapModelSymbol = {
    /** Position in the symbol set; objects refer to it. */
    index: number;
    code: string;
    name: string;
    kind: OmapModelSymbolKind;
    hidden: boolean;
    /** Canonical JSON of the symbol's definition (colours by name, widths, dashes, patterns, elements); equal string = equal look. */
    appearance: string;
};
/** A map object. */
export type OmapModelObject = {
    /** Index into `OmapModel.symbols`. */
    symbolIndex: number;
    points: OmapModelPoint[];
    /** In radians, as in the file. */
    rotation: number;
    text: string | null;
    /** Index of the map part the object lives in. */
    part: number;
};
/** A whole map. */
export type OmapModel = {
    /** Scale denominator, e.g. 10000. */
    scale: number;
    colors: OmapModelColor[];
    symbols: OmapModelSymbol[];
    objects: OmapModelObject[];
    /** Where on earth the map sits, when the file says. */
    georeference: MapGeoreference | null;
};
/**
 * Parses an already-parsed `.omap` document into an `OmapModel`. Like `renderOmap`
 * it only reads the document, so it works with a browser `Document` and with one
 * from `@xmldom/xmldom`.
 */
export declare function parseOmapModel(doc: Document): OmapModel;
