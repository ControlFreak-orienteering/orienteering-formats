import type { ParameterString } from "./parameter-strings.js";
import type { OcadColor } from "./types.js";

const COLOR_RECORD_TYPE = 9;

/**
 * Builds the color table from the file's type-9 parameter strings.
 * Colors are listed in paint order — but front-to-back: the first color
 * defined (`order` 0) is the last one printed, i.e. the topmost/frontmost
 * layer, not the bottom. See the sort in render-svg.ts's renderMapSvg for
 * where this is used.
 */
export function readColors(
  parameterStrings: Map<number, ParameterString[]>,
): OcadColor[] {
  const entries = parameterStrings.get(COLOR_RECORD_TYPE) ?? [];
  return entries.map((entry, order) => {
    const number = Number(entry.fields.get("n") ?? 0);
    const cmyk: [number, number, number, number] = [
      Number(entry.fields.get("c") ?? 0),
      Number(entry.fields.get("m") ?? 0),
      Number(entry.fields.get("y") ?? 0),
      Number(entry.fields.get("k") ?? 0),
    ];
    const [r, g, b] = cmykToRgb(cmyk);
    return {
      number,
      name: entry.subject,
      cmyk,
      rgb: `rgb(${r}, ${g}, ${b})`,
      order,
    };
  });
}

// Screen approximations of 100%-coverage process ink, i.e. "what does a
// solid patch of pure cyan/magenta/yellow/black ink actually look like on
// screen". These are the standard, widely-published values used to
// preview process-color printing (the same kind of chart found in any
// print/prepress reference or color-managed design tool) — printed inks
// are never as saturated as the naive RGB-cube corners (0,255,255) for
// cyan or (0,0,0) for black, they're duller and, for black, noticeably
// lighter. Using them as blend targets (rather than deriving colors from
// the RGB-cube corners) is what fixes both the "washed out neon" look of
// saturated colors and the "pure #000" look of black.
const INK_CYAN: [number, number, number] = [0, 174, 239];
const INK_MAGENTA: [number, number, number] = [236, 0, 140];
const INK_YELLOW: [number, number, number] = [255, 241, 0];
const INK_BLACK: [number, number, number] = [35, 34, 38];

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

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
export function cmykToRgb([c, m, y, k]: [number, number, number, number]): [
  number,
  number,
  number,
] {
  const cf = c / 100;
  const mf = m / 100;
  const yf = y / 100;
  const kf = k / 100;

  const mix = (channel: 0 | 1 | 2): number => {
    const cyan = INK_CYAN[channel];
    const magenta = INK_MAGENTA[channel];
    const yellow = INK_YELLOW[channel];
    const black = INK_BLACK[channel];
    const reflectance =
      lerp(1, cyan / 255, cf) *
      lerp(1, magenta / 255, mf) *
      lerp(1, yellow / 255, yf) *
      lerp(1, black / 255, kf);
    return Math.round(255 * reflectance);
  };

  return [mix(0), mix(1), mix(2)];
}
