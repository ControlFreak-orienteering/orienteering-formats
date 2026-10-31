/**
 * A parsed OpenOrienteering Mapper map (.omap / .xmap) as plain data: colours,
 * symbols and objects, the way `ParsedOcadMap` gives an OCAD map. It is for apps
 * that compare or analyse a map; `renderOmap` draws the same file as SVG.
 *
 * All measures are in the file's own units (1/1000 mm on the printed map, y down).
 */

import type { MapGeoreference } from "./georeference.js";
import {
  childByTag,
  childrenByTag,
  findByTag,
  num,
  parseColors,
  parseCoords,
  parseGeoreferencing,
  parseScale,
  type OmapColor,
} from "./omap.js";

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
export type OmapModelSymbolKind =
  "point" | "line" | "area" | "text" | "combined";

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

/** Attributes that name a symbol rather than describe its look. */
const IDENTITY_ATTRIBUTES = new Set(["id", "code", "name", "is_hidden"]);
/** Child elements that do not affect the look (documentation, cached icon). */
const NON_VISUAL_CHILDREN = new Set(["description", "icon"]);

const KIND_BY_TYPE: Record<number, OmapModelSymbolKind> = {
  1: "point",
  2: "line",
  4: "area",
  8: "text",
  16: "combined",
};

function symbolKind(el: Element): OmapModelSymbolKind {
  if (childByTag(el, "point_symbol")) return "point";
  if (childByTag(el, "line_symbol")) return "line";
  if (childByTag(el, "area_symbol")) return "area";
  if (childByTag(el, "text_symbol")) return "text";
  if (childByTag(el, "combined_symbol")) return "combined";
  return KIND_BY_TYPE[num(el, "type")] ?? "point";
}

/** Where `canonical` finds the symbols a combined symbol's parts refer to. */
type Resolver = {
  colors: Map<number, OmapColor>;
  /** The look of the symbol at this index, or "missing" when there is none or it refers to itself. */
  look: (index: number) => unknown;
};

/**
 * The element as a JSON-ready tree: attributes and children with keys in sorted
 * order, every colour number replaced by the colour's name and rgb, identity
 * (id, code, name, hidden) left out of every symbol, also nested ones, and a
 * combined symbol's references to other symbols replaced by their look.
 */
function canonical(el: Element, r: Resolver): unknown {
  const isSymbol = el.localName === "symbol";
  const attrs: Record<string, string> = {};
  const names = Array.from(el.attributes, (a) => a.name).sort();
  const reference =
    el.localName === "part" &&
    !childByTag(el, "symbol") &&
    el.hasAttribute("symbol");
  for (const name of names) {
    if (isSymbol && IDENTITY_ATTRIBUTES.has(name)) continue;
    if (reference && name === "symbol") continue;
    const value = el.getAttribute(name) ?? "";
    if (/(^|_)color$/.test(name) && /^-?\d+$/.test(value)) {
      const color = r.colors.get(Number(value));
      attrs[name] = color ? `${color.name} ${color.rgb}` : "none";
    } else {
      attrs[name] = value;
    }
  }
  const children = Array.from(el.childNodes).flatMap((n): unknown[] => {
    if (n.nodeType === 1) {
      const child = n as Element;
      if (isSymbol && NON_VISUAL_CHILDREN.has(child.localName)) return [];
      return [canonical(child, r)];
    }
    const text = n.nodeType === 3 ? (n.nodeValue ?? "").trim() : "";
    return text ? [text] : [];
  });
  if (reference) children.push(r.look(num(el, "symbol", -1)));
  return { tag: el.localName, attrs, children };
}

/**
 * Parses an already-parsed `.omap` document into an `OmapModel`. Like `renderOmap`
 * it only reads the document, so it works with a browser `Document` and with one
 * from `@xmldom/xmldom`.
 */
export function parseOmapModel(doc: Document): OmapModel {
  const colorTable = parseColors(doc);
  const colors = [...colorTable.values()].map((c): OmapModelColor => ({
    index: c.order,
    name: c.name,
    rgb: c.rgb,
    priority: c.order,
  }));

  const symbolEls = findByTag(doc, "symbols").flatMap((el) =>
    childrenByTag(el, "symbol"),
  );
  const active = new Set<number>();
  const resolver: Resolver = {
    colors: colorTable,
    look: (index) => {
      const el = symbolEls[index];
      if (!el || active.has(index)) return "missing";
      active.add(index);
      const tree = canonical(el, resolver);
      active.delete(index);
      return tree;
    },
  };
  const symbols = symbolEls.map((el, index): OmapModelSymbol => {
    const appearance = JSON.stringify(canonical(el, resolver));
    return {
      index,
      code: el.getAttribute("code") ?? "",
      name: el.getAttribute("name") ?? "",
      kind: symbolKind(el),
      hidden: el.getAttribute("is_hidden") === "true",
      appearance,
    };
  });

  const parts = findByTag(doc, "parts").flatMap((el) =>
    childrenByTag(el, "part"),
  );
  const objects: OmapModelObject[] = [];
  parts.forEach((partEl, part) => {
    for (const objectsEl of childrenByTag(partEl, "objects")) {
      for (const el of childrenByTag(objectsEl, "object")) {
        const points = parseCoords(childByTag(el, "coords"));
        if (points.length === 0) continue;
        objects.push({
          symbolIndex: num(el, "symbol", -1),
          points,
          rotation: num(el, "rotation"),
          text: childByTag(el, "text")?.textContent ?? null,
          part,
        });
      }
    }
  });

  const { scale } = parseScale(doc);
  return {
    scale,
    colors,
    symbols,
    objects,
    georeference: parseGeoreferencing(doc, scale / 1_000_000),
  };
}
