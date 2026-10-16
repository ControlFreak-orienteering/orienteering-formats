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
 * Renders a parsed OCAD map to an SVG fragment. This favours a legible,
 * correctly-colored base map over full cartographic fidelity: decorative
 * symbols spaced along lines (fences, cliffs with tick marks, etc.) are
 * not drawn. Plain point symbols, line symbols (incl. double lines and
 * framing), area symbols (incl. holes, bezier curves, hatch lines and
 * repeating-icon "structure" fills) render at full fidelity.
 *
 * @param map - The map from `parseOcadFile`.
 * @param options - See `RenderOptions`.
 * @returns The SVG content and the `viewBox` that holds it.
 */
export declare function renderMapSvg(map: ParsedOcadMap, options?: RenderOptions): RenderedMap;
export declare function escapeXml(s: string): string;
