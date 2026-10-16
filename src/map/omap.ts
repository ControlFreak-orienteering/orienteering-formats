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

import { cmykToRgb } from "./ocad/colors.js";
import { escapeXml } from "./ocad/render-svg.js";
import {
  projectionForEpsg,
  projectionFromProj4,
  utmProjection,
  type MapGeoreference,
  type TransverseMercator,
} from "./georeference.js";

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

type OmapColor = {
  rgb: string;
  opacity: number;
  /** Paint order; 0 is the frontmost color. See `Renderer.markup`. */
  order: number;
};

type Border = { color: number; width: number; shift: number };

type LineDef = {
  color: number;
  width: number;
  dashed: boolean;
  dashLength: number;
  breakLength: number;
  dashesInGroup: number;
  inGroupBreakLength: number;
  capStyle: number;
  joinStyle: number;
  borders: Border[];
};

type PointDef = {
  innerRadius: number;
  innerColor: number;
  outerWidth: number;
  outerColor: number;
  elements: { symbol: Symbol_; points: Pt[] }[];
};

type AreaPattern =
  | { kind: "hatch"; angle: number; spacing: number; color: number; width: number }
  | { kind: "points"; angle: number; spacing: number; distance: number; point: PointDef };

type TextDef = {
  family: string;
  size: number;
  bold: boolean;
  italic: boolean;
  color: number;
  lineSpacing: number;
};

/** `Symbol` is taken by the built-in type, hence the trailing underscore. */
type Symbol_ =
  | { kind: "point"; hidden: boolean; point: PointDef }
  | { kind: "line"; hidden: boolean; line: LineDef }
  | { kind: "area"; hidden: boolean; innerColor: number; patterns: AreaPattern[]; id: number }
  | { kind: "text"; hidden: boolean; text: TextDef }
  | { kind: "combined"; hidden: boolean; parts: (Symbol_ | number)[] }
  | { kind: "unknown"; hidden: boolean };

/** One drawn shape, tagged with the paint order of the color it uses. */
type DrawOp = { order: number; markup: string };

const NO_COLOR = -1;

/* -------------------------------------------------------------------- */
/* Reading                                                               */
/* -------------------------------------------------------------------- */

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
export function childrenByTag(el: Element, name: string): Element[] {
  return Array.from(el.childNodes).filter(
    (n): n is Element => n.nodeType === 1 && (n as Element).localName === name,
  );
}

/** The first direct child with the given tag name, see `childrenByTag`. */
export function childByTag(el: Element, name: string): Element | null {
  return childrenByTag(el, name)[0] ?? null;
}

/**
 * Every element with the given tag name, wherever it sits. The file wraps
 * its sections in `<barrier>` elements marking the format version they
 * need, so `<symbols>`, `<parts>` and the rest are not children of
 * `<map>` at a fixed depth. Matches are not descended into.
 */
export function findByTag(root: Element | Document, name: string): Element[] {
  const found: Element[] = [];
  const walk = (node: Element | Document): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      if (el.localName === name) found.push(el);
      else walk(el);
    }
  };
  walk(root);
  return found;
}

function num(el: Element | null, attr: string, fallback = 0): number {
  const raw = el?.getAttribute(attr);
  if (raw === null || raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * The color on screen.
 *
 * A color is defined either in CMYK or in RGB, and `<rgb method>` says
 * which: `cmyk` means the RGB values are just Mapper's own conversion of
 * the CMYK ones, and are thrown away here in favour of `cmykToRgb`, the
 * print-like conversion the OCAD reader uses — otherwise the same map
 * would come out in flat, neon colors as an .omap and in printed ones as
 * an .ocd. Any other method means somebody chose those RGB values, and
 * then they are the color.
 */
function colorRgb(el: Element): string {
  const rgbEl = childByTag(el, "rgb");
  if (rgbEl && rgbEl.getAttribute("method") !== "cmyk") {
    const to = (attr: string) => Math.round(num(rgbEl, attr) * 255);
    return `rgb(${to("r")}, ${to("g")}, ${to("b")})`;
  }
  // The file's CMYK values run 0–1; `cmykToRgb` wants percentages.
  const [r, g, b] = cmykToRgb([
    num(el, "c") * 100,
    num(el, "m") * 100,
    num(el, "y") * 100,
    num(el, "k") * 100,
  ]);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * The color table, keyed by the number symbols refer to it by.
 *
 * That number is the color's `priority` attribute — *not* `number`, which
 * the format does not use. Reading the wrong attribute leaves every
 * lookup empty, and the whole map comes out unpainted.
 */
function parseColors(doc: Document): Map<number, OmapColor> {
  const colors = new Map<number, OmapColor>();
  const table = findByTag(doc, "colors").flatMap((el) => childrenByTag(el, "color"));
  table.forEach((el, index) => {
    const declared = num(el, "priority", Number.NaN);
    const order = Number.isFinite(declared) ? declared : index;
    colors.set(order, { rgb: colorRgb(el), opacity: num(el, "opacity", 1), order });
  });
  return colors;
}

/** The points of a `<coords>` element: "x y flags;" for each point. */
export function parseCoords(el: Element | null): Pt[] {
  const text = el?.textContent;
  if (!text) return [];
  const pts: Pt[] = [];
  for (const part of text.split(";")) {
    const nums = part.trim().split(/\s+/).map(Number);
    if (nums.length < 2 || !Number.isFinite(nums[0]!) || !Number.isFinite(nums[1]!)) continue;
    const flags = nums[2] ?? 0;
    pts.push({
      x: nums[0]!,
      y: nums[1]!,
      curveStart: (flags & 1) !== 0,
      closePoint: (flags & 2) !== 0,
      holePoint: (flags & 16) !== 0,
    });
  }
  return pts;
}

function parseLine(el: Element): LineDef {
  return {
    color: num(el, "color", NO_COLOR),
    width: num(el, "line_width"),
    dashed: el.getAttribute("dashed") === "true",
    dashLength: num(el, "dash_length"),
    breakLength: num(el, "break_length"),
    dashesInGroup: num(el, "dashes_in_group", 1),
    inGroupBreakLength: num(el, "in_group_break_length"),
    capStyle: num(el, "cap_style"),
    joinStyle: num(el, "join_style"),
    borders: childrenByTag(el, "borders").flatMap((bs) =>
      childrenByTag(bs, "border").map((b) => ({
        color: num(b, "color", NO_COLOR),
        width: num(b, "width"),
        shift: num(b, "shift"),
      })),
    ),
  };
}

function parsePoint(el: Element): PointDef {
  const elements = childrenByTag(el, "element").flatMap((elementEl) => {
    const symEl = childByTag(elementEl, "symbol");
    const objEl = childByTag(elementEl, "object");
    if (!symEl || !objEl) return [];
    return [
      {
        symbol: parseSymbol(symEl),
        points: parseCoords(childByTag(objEl, "coords")),
      },
    ];
  });
  return {
    innerRadius: num(el, "inner_radius"),
    innerColor: num(el, "inner_color", NO_COLOR),
    outerWidth: num(el, "outer_width"),
    outerColor: num(el, "outer_color", NO_COLOR),
    elements,
  };
}

function parseAreaPatterns(el: Element): AreaPattern[] {
  return childrenByTag(el, "pattern").flatMap((p): AreaPattern[] => {
    const angle = num(p, "angle");
    const spacing = num(p, "line_spacing");
    if (spacing <= 0) return [];
    if (num(p, "type") === 1) {
      return [
        {
          kind: "hatch",
          angle,
          spacing,
          color: num(p, "color", NO_COLOR),
          width: num(p, "line_width"),
        },
      ];
    }
    const pointEl = childByTag(p, "symbol");
    const def = pointEl && childByTag(pointEl, "point_symbol");
    if (!def) return [];
    return [
      {
        kind: "points",
        angle,
        spacing,
        distance: Math.max(1, num(p, "point_distance", spacing)),
        point: parsePoint(def),
      },
    ];
  });
}

/** Running counter behind the `id` of every generated `<pattern>` fill. */
let patternSeq = 0;

function parseSymbol(el: Element): Symbol_ {
  const hidden = el.getAttribute("is_hidden") === "true";

  const point = childByTag(el, "point_symbol");
  if (point) return { kind: "point", hidden, point: parsePoint(point) };

  const line = childByTag(el, "line_symbol");
  if (line) return { kind: "line", hidden, line: parseLine(line) };

  const area = childByTag(el, "area_symbol");
  if (area) {
    return {
      kind: "area",
      hidden,
      innerColor: num(area, "inner_color", NO_COLOR),
      patterns: parseAreaPatterns(area),
      id: patternSeq++,
    };
  }

  const text = childByTag(el, "text_symbol");
  if (text) {
    const font = childByTag(text, "font");
    const body = childByTag(text, "text");
    return {
      kind: "text",
      hidden,
      text: {
        family: font?.getAttribute("family") ?? "sans-serif",
        size: num(font, "size"),
        bold: font?.getAttribute("bold") === "true",
        italic: font?.getAttribute("italic") === "true",
        color: num(body, "color", NO_COLOR),
        lineSpacing: num(body, "line_spacing", 1) || 1,
      },
    };
  }

  const combined = childByTag(el, "combined_symbol");
  if (combined) {
    const parts = childrenByTag(combined, "part").map((partEl): Symbol_ | number => {
      // A part is either spelled out inline ("private") or a reference to
      // another symbol in the map's own symbol set, resolved at drawing
      // time since it may point forwards.
      const inline = childByTag(partEl, "symbol");
      return inline ? parseSymbol(inline) : num(partEl, "symbol", -1);
    });
    return { kind: "combined", hidden, parts };
  }

  return { kind: "unknown", hidden };
}

/* -------------------------------------------------------------------- */
/* Drawing                                                               */
/* -------------------------------------------------------------------- */

class Renderer {
  /** `<pattern>` fills, keyed by id: one per area symbol, not per object. */
  private readonly defs = new Map<string, { markup: string; order: number }>();
  /**
   * A point symbol's graphics, keyed by the element they came from.
   * The geometry is the same every time the symbol is used; only the
   * `<g transform>` that puts it on the map differs.
   */
  private readonly elementCache = new WeakMap<object, DrawOp[]>();
  private readonly ops: DrawOp[] = [];

  constructor(
    private readonly colors: Map<number, OmapColor>,
    private readonly symbols: Symbol_[],
  ) {}

  private color(n: number): string {
    return this.colors.get(n)?.rgb ?? "rgb(0, 0, 0)";
  }

  private order(n: number): number {
    return this.colors.get(n)?.order ?? 0;
  }

  private opacity(n: number): number {
    return this.colors.get(n)?.opacity ?? 1;
  }

  private push(colorNumber: number, markup: string): void {
    if (!markup) return;
    this.ops.push({ order: this.order(colorNumber), markup });
  }

  /** Paint attributes shared by every shape drawn in a given color. */
  private paint(colorNumber: number, kind: "fill" | "stroke"): string {
    const opacity = this.opacity(colorNumber);
    return opacity < 1 ? ` ${kind}-opacity="${opacity}"` : "";
  }

  private strokePath(d: string, line: LineDef, colorNumber: number, width: number): void {
    if (!d || width <= 0 || colorNumber === NO_COLOR) return;
    const cap = ["butt", "round", "square", "butt"][line.capStyle] ?? "round";
    const join = ["bevel", "miter", "round"][line.joinStyle] ?? "round";
    const dash = dashArray(line);
    this.push(
      colorNumber,
      `<path d="${d}" fill="none" stroke="${this.color(colorNumber)}" stroke-width="${width}"` +
        ` stroke-linecap="${cap}" stroke-linejoin="${join}"` +
        `${dash ? ` stroke-dasharray="${dash}"` : ""}${this.paint(colorNumber, "stroke")} />`,
    );
  }

  private fillPath(d: string, colorNumber: number): void {
    if (!d || colorNumber === NO_COLOR) return;
    this.push(
      colorNumber,
      `<path d="${d}" fill="${this.color(colorNumber)}" fill-rule="evenodd"${this.paint(colorNumber, "fill")} />`,
    );
  }

  /** Draws one object's geometry with one symbol. */
  private drawWith(symbol: Symbol_, points: Pt[], object: MapObject): void {
    switch (symbol.kind) {
      case "line":
        this.drawLine(symbol.line, points);
        break;
      case "area":
        this.drawArea(symbol, points);
        break;
      case "point":
        this.drawPoint(symbol.point, points[0], object.rotation);
        break;
      case "text":
        this.drawText(symbol.text, points[0], object);
        break;
      case "combined":
        for (const part of symbol.parts) {
          const resolved = typeof part === "number" ? this.symbols[part] : part;
          if (resolved) this.drawWith(resolved, points, object);
        }
        break;
      case "unknown":
        break;
    }
  }

  private drawLine(line: LineDef, points: Pt[]): void {
    const d = pathData(points, false);
    if (!d) return;

    // Border lines run alongside the main line, one on each side. A
    // single `<border>` describes both sides; two describe them
    // separately (left first).
    const sides: { border: Border; sign: number }[] =
      line.borders.length === 1
        ? [
            { border: line.borders[0]!, sign: 1 },
            { border: line.borders[0]!, sign: -1 },
          ]
        : line.borders.map((border, i) => ({ border, sign: i === 0 ? 1 : -1 }));

    for (const { border, sign } of sides) {
      if (border.width <= 0) continue;
      const shifted = pathData(offsetPoints(points, sign * border.shift), false);
      this.strokePath(shifted, line, border.color, border.width);
    }

    this.strokePath(d, line, line.color, line.width);
  }

  private drawArea(symbol: Symbol_ & { kind: "area" }, points: Pt[]): void {
    const d = pathData(points, true);
    if (!d) return;

    this.fillPath(d, symbol.innerColor);

    // A fill and its patterns layer rather than being alternatives (a
    // pale green wash under a marsh's blue dashes, say), and each one
    // enters the paint order at its own color's place, not necessarily
    // together with the fill.
    symbol.patterns.forEach((pattern, i) => {
      const def = this.patternDef(`omap-pattern-${symbol.id}-${i}`, pattern);
      if (!def) return;
      this.ops.push({
        order: def.order,
        markup: `<path d="${d}" fill="url(#${def.id})" fill-rule="evenodd" />`,
      });
    });
  }

  /**
   * The `<pattern>` fill for one of an area symbol's patterns, defined
   * once however many objects use the symbol. Returns the id to paint
   * with and the paint order the fill belongs at.
   */
  private patternDef(id: string, pattern: AreaPattern): { id: string; order: number } | null {
    const known = this.defs.get(id);
    if (known) return { id, order: known.order };

    const transform = ` patternTransform="rotate(${-degrees(pattern.angle)})"`;
    if (pattern.kind === "hatch") {
      if (pattern.color === NO_COLOR || pattern.width <= 0) return null;
      // The tile is one stripe: as wide as it is tall, since a stripe
      // spanning the full width tiles seamlessly along its own direction.
      const markup =
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${pattern.spacing}" height="${pattern.spacing}"${transform}>` +
        `<rect x="0" y="0" width="${pattern.spacing}" height="${pattern.width}" fill="${this.color(pattern.color)}"${this.paint(pattern.color, "fill")} /></pattern>`;
      const order = this.order(pattern.color);
      this.defs.set(id, { markup, order });
      return { id, order };
    }

    // A tile holding one copy of the pattern's point symbol. Its elements
    // can be several colors, so the tile as a whole sorts at the
    // frontmost of them: these are small repeated marks (the dots of a
    // marsh, the stones of scree) meant to sit on top of the plain colors
    // beneath.
    const tile = new Renderer(this.colors, this.symbols);
    tile.drawPoint(pattern.point, { x: pattern.distance / 2, y: pattern.spacing / 2 }, 0);
    if (tile.ops.length === 0) return null;
    const markup =
      `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${pattern.distance}" height="${pattern.spacing}"${transform}>` +
      `${tile.ops.map((op) => op.markup).join("")}</pattern>`;
    const order = Math.min(...tile.ops.map((op) => op.order));
    this.defs.set(id, { markup, order });
    return { id, order };
  }

  /**
   * A point symbol: an optional filled disc and ring, plus any number of
   * graphic elements given as little objects in the symbol's own
   * coordinates, centred on the origin.
   *
   * `rotation` is in radians and turns counter-clockwise on screen, so it
   * is negated for SVG's `rotate()`, which turns the other way.
   */
  private drawPoint(point: PointDef, at: { x: number; y: number } | undefined, rotation: number) {
    if (!at) return;
    const { x, y } = at;

    if (point.innerColor !== NO_COLOR && point.innerRadius > 0) {
      this.push(
        point.innerColor,
        `<circle cx="${x}" cy="${y}" r="${point.innerRadius}" fill="${this.color(point.innerColor)}"${this.paint(point.innerColor, "fill")} />`,
      );
    }
    if (point.outerColor !== NO_COLOR && point.outerWidth > 0) {
      const r = point.innerRadius + point.outerWidth / 2;
      this.push(
        point.outerColor,
        `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${this.color(point.outerColor)}" stroke-width="${point.outerWidth}"${this.paint(point.outerColor, "stroke")} />`,
      );
    }
    if (point.elements.length === 0) return;

    // The elements are drawn about the origin and then moved into place
    // as a group. Each element keeps its own color's paint order — a
    // two-tone symbol must not sort as a single unit under whichever
    // color its first element happened to use.
    const transform = ` transform="translate(${x}, ${y})${rotation ? ` rotate(${-degrees(rotation)})` : ""}"`;
    for (const element of point.elements) {
      for (const op of this.elementOps(element)) {
        this.ops.push({ order: op.order, markup: `<g${transform}>${op.markup}</g>` });
      }
    }
  }

  /** A point symbol element's own graphics, drawn about the origin. */
  private elementOps(element: { symbol: Symbol_; points: Pt[] }): DrawOp[] {
    const cached = this.elementCache.get(element);
    if (cached) return cached;

    const inner = new Renderer(this.colors, this.symbols);
    inner.drawWith(element.symbol, element.points, PLACEHOLDER_OBJECT);
    for (const [id, def] of inner.defs) this.defs.set(id, def);
    this.elementCache.set(element, inner.ops);
    return inner.ops;
  }

  private drawText(text: TextDef, at: Pt | undefined, object: MapObject): void {
    if (!at || !object.text || text.color === NO_COLOR || text.size <= 0) return;
    const anchor = ["start", "middle", "end"][object.hAlign] ?? "start";
    // 0 is the font's own baseline, which is what SVG's default does.
    const baseline = ["", "text-before-edge", "central", "text-after-edge"][object.vAlign] ?? "";
    const lineHeight = text.size * text.lineSpacing;
    const tspans = object.text
      .split("\n")
      .map(
        (line, i) => `<tspan x="${at.x}" y="${at.y + i * lineHeight}">${escapeXml(line)}</tspan>`,
      )
      .join("");
    const transform = object.rotation
      ? ` transform="rotate(${-degrees(object.rotation)}, ${at.x}, ${at.y})"`
      : "";
    this.push(
      text.color,
      `<text x="${at.x}" y="${at.y}" fill="${this.color(text.color)}"` +
        ` font-family="${escapeXml(text.family)}" font-size="${text.size}"` +
        `${text.bold ? ` font-weight="bold"` : ""}${text.italic ? ` font-style="italic"` : ""}` +
        ` text-anchor="${anchor}"${baseline ? ` dominant-baseline="${baseline}"` : ""}` +
        `${transform}${this.paint(text.color, "fill")}>${tspans}</text>`,
    );
  }

  draw(object: MapObject): void {
    const symbol = this.symbols[object.symbol];
    if (!symbol || symbol.hidden) return;
    try {
      this.drawWith(symbol, object.points, object);
    } catch {
      // One malformed object must never cost us the rest of the map.
    }
  }

  /**
   * The finished markup, sorted into paint order.
   *
   * Colors are listed frontmost-first in the file (priority 0 is the
   * last color printed, not the first), and every shape is printed
   * strictly in that order regardless of which object it belongs to —
   * that is what keeps contours above the green and the green above the
   * yellow. SVG paints first-to-last, so the order sorts descending, and
   * the sort is stable, so same-color shapes keep the file's own order.
   */
  markup(): string {
    const body = [...this.ops].sort((a, b) => b.order - a.order);
    const defs = this.defs.size
      ? `<defs>${Array.from(this.defs.values(), (d) => d.markup).join("")}</defs>`
      : "";
    return defs + body.map((op) => op.markup).join("");
  }
}

type MapObject = {
  symbol: number;
  points: Pt[];
  rotation: number;
  text: string | null;
  hAlign: number;
  vAlign: number;
};

/** Stands in for the object when drawing a symbol's own inner graphics. */
const PLACEHOLDER_OBJECT: MapObject = {
  symbol: -1,
  points: [],
  rotation: 0,
  text: null,
  hAlign: 0,
  vAlign: 0,
};

/** Angles are stored in radians; SVG wants degrees, and four decimals of
 * a degree is a tenth of a millimetre a hundred metres away. */
const degrees = (radians: number) => Math.round(((radians * 180) / Math.PI) * 1e4) / 1e4;

/**
 * The dash pattern as a `stroke-dasharray`.
 *
 * A dashed line repeats groups of `dashesInGroup` dashes: dashes within a
 * group are separated by the short in-group break, groups by the longer
 * break. SVG repeats the whole list, which gives exactly that rhythm.
 */
function dashArray(line: LineDef): string | null {
  if (!line.dashed || line.dashLength <= 0) return null;
  const gap = line.breakLength;
  if (gap <= 0) return null;
  const inGroup = line.inGroupBreakLength;
  if (line.dashesInGroup > 1 && inGroup > 0) {
    const parts: number[] = [];
    for (let i = 1; i < line.dashesInGroup; i++) parts.push(line.dashLength, inGroup);
    parts.push(line.dashLength, gap);
    return parts.join(" ");
  }
  return `${line.dashLength} ${gap}`;
}

/**
 * The same line, moved `distance` units to one side, for a double line's
 * border lines. A true parallel curve to a Bezier is not itself a Bezier,
 * but these offsets are fractions of a millimetre against curve radii of
 * tens of metres: moving every point (control points included) along the
 * local normal is indistinguishable from the real thing at that size.
 *
 * The normal comes from the direction between a point's neighbours, so a
 * point at a corner ends up along the bisector. Sub-paths are handled
 * separately — a point never borrows a direction from a stretch it is
 * not part of.
 */
function offsetPoints(points: Pt[], distance: number): Pt[] {
  if (points.length < 2 || distance === 0) return points;

  const bounds: [number, number][] = [];
  let from = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i]!.holePoint) {
      bounds.push([from, i]);
      from = i + 1;
    }
  }
  if (from < points.length) bounds.push([from, points.length - 1]);

  const out = points.slice();
  for (const [first, last] of bounds) {
    for (let i = first; i <= last; i++) {
      const before = points[Math.max(first, i - 1)]!;
      const after = points[Math.min(last, i + 1)]!;
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      out[i] = {
        ...points[i]!,
        x: points[i]!.x + (dy / len) * distance,
        y: points[i]!.y - (dx / len) * distance,
      };
    }
  }
  return out;
}

/**
 * Turns a flagged vertex list into an SVG path, following the curve and
 * sub-path flags: a `curveStart` vertex is followed by two control points
 * and the curve's end, a `holePoint` vertex ends its sub-path, and a
 * `closePoint` vertex closes it.
 */
function pathData(points: Pt[], closeSubPaths: boolean): string {
  if (points.length === 0) return "";
  const segments: string[] = [`M ${points[0]!.x} ${points[0]!.y}`];
  let closeThis = closeSubPaths;

  let i = 0;
  while (i < points.length) {
    const p = points[i]!;
    if (p.closePoint) closeThis = true;

    if (p.holePoint || i === points.length - 1) {
      if (closeThis) segments.push("Z");
      closeThis = closeSubPaths;
      i += 1;
      if (i < points.length) segments.push(`M ${points[i]!.x} ${points[i]!.y}`);
      continue;
    }

    if (p.curveStart && i + 3 < points.length) {
      const c1 = points[i + 1]!;
      const c2 = points[i + 2]!;
      const end = points[i + 3]!;
      segments.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`);
      i += 3;
      continue;
    }

    const next = points[i + 1]!;
    segments.push(`L ${next.x} ${next.y}`);
    i += 1;
  }

  return segments.join(" ");
}

/* -------------------------------------------------------------------- */
/* Georeferencing                                                        */
/* -------------------------------------------------------------------- */

/**
 * The projection a `<projected_crs>` describes.
 *
 * Mapper writes the same thing in up to three ways, so all three are
 * tried. The PROJ.4 spec comes first because it is the only one that is
 * self-contained — a `+proj=tmerc` line carries every parameter and needs
 * no table of codes at all.
 */
function parseProjection(crs: Element): TransverseMercator | null {
  const spec = childByTag(crs, "spec")?.textContent?.trim();
  if (spec) {
    const fromSpec = projectionFromProj4(spec);
    if (fromSpec) return fromSpec;
  }

  const parameters = childrenByTag(crs, "parameter").map((p) => (p.textContent ?? "").trim());
  const id = crs.getAttribute("id") ?? "";
  if (id === "EPSG") {
    const code = Number(parameters[0]);
    return Number.isFinite(code) ? projectionForEpsg(code) : null;
  }
  if (id === "UTM") {
    // Written as e.g. "33 N" or "33 S".
    const zone = Number(/\d+/.exec(parameters[0] ?? "")?.[0]);
    return Number.isFinite(zone) ? utmProjection(zone, /s/i.test(parameters[0] ?? "")) : null;
  }
  return null;
}

/**
 * The map's georeferencing, or `null` when the file has none we can use.
 *
 * `metersPerUnit` is the caller's, not the file's: the user may have
 * overridden the scale, and then that is the scale the map is being worked
 * in, so it has to be the one the offsets are measured with too.
 */
function parseGeoreferencing(doc: Document, metersPerUnit: number): MapGeoreference | null {
  const geo = findByTag(doc, "georeferencing")[0];
  if (!geo) return null;
  const projectedCrs = childByTag(geo, "projected_crs");
  if (!projectedCrs) return null;
  const projection = parseProjection(projectedCrs);
  if (!projection) return null;

  const refPoint = childByTag(projectedCrs, "ref_point");
  if (!refPoint) return null;

  // The map coordinate the reference point sits at. Mapper leaves the
  // element out when it is the origin, which it nearly always is.
  const mapRef = childByTag(geo, "ref_point");
  const mapRefX = num(mapRef, "x");
  const mapRefY = num(mapRef, "y");

  // From the reference point back to the map's own origin. Map Y points
  // down, so a positive map Y is a step south.
  const east = -mapRefX * metersPerUnit;
  const north = mapRefY * metersPerUnit;
  const grivationDeg = num(geo, "grivation");
  const g = (grivationDeg * Math.PI) / 180;

  return {
    easting: num(refPoint, "x") + east * Math.cos(g) + north * Math.sin(g),
    northing: num(refPoint, "y") - east * Math.sin(g) + north * Math.cos(g),
    grivationDeg,
    projection,
  };
}

/* -------------------------------------------------------------------- */
/* Entry point                                                           */
/* -------------------------------------------------------------------- */

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
export function renderOmap(doc: Document): OmapRender {
  const colors = parseColors(doc);
  patternSeq = 0;
  const symbols = findByTag(doc, "symbols")
    .flatMap((el) => childrenByTag(el, "symbol"))
    .map(parseSymbol);

  const map = findByTag(doc, "map")[0] ?? doc.documentElement;
  const rawScale = num(findByTag(doc, "georeferencing")[0] ?? map, "scale", 15000);
  // Guard against missing or nonsensical scale values in the file.
  const scaleFromFile = rawScale >= 500 && rawScale <= 200000;
  const scale = scaleFromFile ? rawScale : 15000;
  // OpenOrienteering Mapper coordinates are in 1/1000 mm on the printed map.
  const metersPerUnit = scale / 1_000_000;

  const renderer = new Renderer(colors, symbols);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const objects of findByTag(doc, "objects")) {
    for (const el of childrenByTag(objects, "object")) {
      const points = parseCoords(childByTag(el, "coords"));
      if (points.length === 0) continue;
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      renderer.draw({
        symbol: num(el, "symbol", -1),
        points,
        rotation: num(el, "rotation"),
        text: childByTag(el, "text")?.textContent ?? null,
        hAlign: num(el, "h_align"),
        vAlign: num(el, "v_align"),
      });
    }
  }

  const viewBox = Number.isFinite(minX)
    ? `${minX} ${minY} ${Math.max(1, maxX - minX)} ${Math.max(1, maxY - minY)}`
    : "0 0 1 1";

  return {
    innerMarkup: renderer.markup(),
    viewBox,
    scale,
    metersPerUnit,
    scaleFromFile,
    georef: parseGeoreferencing(doc, metersPerUnit),
  };
}
