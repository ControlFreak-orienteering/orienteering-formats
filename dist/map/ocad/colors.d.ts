import type { ParameterString } from "./parameter-strings.js";
import type { OcadColor } from "./types.js";
/**
 * Builds the color table from the file's type-9 parameter strings.
 * Colors are listed in paint order — but front-to-back: the first color
 * defined (`order` 0) is the last one printed, i.e. the topmost/frontmost
 * layer, not the bottom. See the sort in render-svg.ts's renderMapSvg for
 * where this is used.
 */
export declare function readColors(parameterStrings: Map<number, ParameterString[]>): OcadColor[];
/**
 * CMYK (0-100 scale, as stored in .ocd files) to RGB conversion. Print-
 * accurate color management (ICC profiles etc.) is out of scope; this
 * aims for a visually reasonable on-screen approximation, not a bit-exact
 * match to any particular print simulation.
 *
 * Each ink is modeled as independently pulling the page color toward its
 * own real-world screen color (see INK_* above), proportional to its
 * coverage, and the four inks are combined multiplicatively per channel
 * (0% coverage of an ink leaves a channel untouched; 100% coverage pulls
 * it all the way to that ink's own color). This replaces a naive
 * `R = 255*(1-c)*(1-k)` model, which implicitly treats 100% cyan as pure
 * (0,255,255) and 100% black as pure (0,0,0) — collapsing every heavily-
 * inked color toward a handful of oversaturated primaries or flat black,
 * rather than the duller, "rich" mixes real process-printed colors are.
 */
export declare function cmykToRgb([c, m, y, k]: [number, number, number, number]): [
    number,
    number,
    number
];
