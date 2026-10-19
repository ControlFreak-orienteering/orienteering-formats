import type { ParsedOcadMap } from "./types.js";
/** Options for `renderMapSvg`. */
export interface RenderOptions {
    /** Include objects belonging to hidden symbols. Default: false. */
    exportHidden?: boolean;
}
/** A drawn OCAD map. */
export interface RenderedMap {
    /** Inner SVG markup (no outer <svg> tag); see `mapSvgMarkup` for a whole document. */
    innerMarkup: string;
    /** `viewBox` value matching the map's geometry, in 1/100 mm units, Y already flipped for screen display. */
    viewBox: string;
}
/**
 * Renders a parsed OCAD map to an SVG fragment. Point symbols, line symbols
 * (incl. double lines, framing and the symbols drawn along them, such as a
 * cliff's tags or a contour's slope lines), area symbols (incl. holes, bezier
 * curves, hatch lines and repeating-icon "structure" fills) are drawn. Not
 * drawn: a line's secondary symbols, and the different first and last dash.
 *
 * @param map - The map from `parseOcadFile`.
 * @param options - See `RenderOptions`.
 * @returns The SVG content and the `viewBox` that holds it.
 */
export declare function renderMapSvg(map: ParsedOcadMap, options?: RenderOptions): RenderedMap;
export declare function escapeXml(s: string): string;
