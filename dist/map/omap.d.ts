/**
 * Renderer for OpenOrienteering Mapper files (.omap / .xmap).
 *
 * The format is XML: a color table, a symbol set, and the objects that
 * reference them. Like the OCAD reader next door this favours a legible,
 * correctly-colored base map over full cartographic fidelity: symbols
 * spaced along a line (fence tags, cliff ticks, the arrows on a "mid
 * symbol") are not drawn. Point, line, area (incl. holes, hatch and
 * point-pattern fills) and text symbols render at full fidelity.
 *
 * Every measure in the file — coordinates, line widths, font sizes — is
 * in 1/1000 mm on the printed map, and those units are also the SVG's
 * user units, so no scaling happens anywhere below.
 */
import { type MapGeoreference } from "./georeference.js";
/**
 * Unlike OCAD (and unlike SVG's own convention of naming the top-left
 * corner first), OpenOrienteering Mapper's Y axis already points *down*:
 * a map coordinate is a screen coordinate. Nothing here negates Y — doing
 * so is exactly what turns the map upside down.
 */
type Pt = {
    x: number;
    y: number;
    /** This vertex starts a cubic Bezier; the next two are its control points. */
    curveStart: boolean;
    /** This vertex closes its sub-path (it repeats the sub-path's first vertex). */
    closePoint: boolean;
    /** This vertex ends its sub-path; the next one starts a new one (an area's hole). */
    holePoint: boolean;
};
/**
 * Direct children with the given tag name. A subtree search would be
 * wrong here: a combined symbol holds whole nested `<symbol>` elements
 * and an area pattern holds a nested point symbol, so `querySelector`
 * happily returns the inner definition of a *different* symbol as if it
 * were this one's.
 *
 * Elements are matched on `localName`, and the tree is walked through
 * `childNodes`, so the same code works on a browser `Document` and on the
 * bare XML documents the tests parse (with @xmldom/xmldom).
 */
export declare function childrenByTag(el: Element, name: string): Element[];
/** The first direct child with the given tag name, see `childrenByTag`. */
export declare function childByTag(el: Element, name: string): Element | null;
/**
 * Every element with the given tag name, wherever it sits. The file wraps
 * its sections in `<barrier>` elements marking the format version they
 * need, so `<symbols>`, `<parts>` and the rest are not children of
 * `<map>` at a fixed depth. Matches are not descended into.
 */
export declare function findByTag(root: Element | Document, name: string): Element[];
/** The points of a `<coords>` element: "x y flags;" for each point. */
export declare function parseCoords(el: Element | null): Pt[];
export type OmapRender = {
    /** Inner SVG markup, without the enclosing `<svg>` tag. */
    innerMarkup: string;
    /** `viewBox` value matching the map's geometry, in 1/1000 mm units. */
    viewBox: string;
    scale: number;
    metersPerUnit: number;
    scaleFromFile: boolean;
    /** Where on earth the map sits, when the file says; see `georeference.ts`. */
    georef: MapGeoreference | null;
};
/**
 * Renders an already-parsed map document to an SVG fragment. Kept apart
 * from `omapToSvg` so it can be exercised without a DOM — it only ever
 * reads the document it is given.
 */
export declare function renderOmap(doc: Document): OmapRender;
export {};
