/**
 * A parsed OpenOrienteering Mapper map (.omap / .xmap) as plain data: colours,
 * symbols and objects, the way `ParsedOcadMap` gives an OCAD map. It is for apps
 * that compare or analyse a map; `renderOmap` draws the same file as SVG.
 *
 * All measures are in the file's own units (1/1000 mm on the printed map, y down).
 */
import { childByTag, childrenByTag, findByTag, num, parseColors, parseCoords, parseGeoreferencing, parseScale, } from "./omap.js";
/** Attributes that name a symbol rather than describe its look. */
const IDENTITY_ATTRIBUTES = new Set(["id", "code", "name", "is_hidden"]);
/** Child elements that do not affect the look (documentation, cached icon). */
const NON_VISUAL_CHILDREN = new Set(["description", "icon"]);
const KIND_BY_TYPE = {
    1: "point",
    2: "line",
    4: "area",
    8: "text",
    16: "combined",
};
function symbolKind(el) {
    if (childByTag(el, "point_symbol"))
        return "point";
    if (childByTag(el, "line_symbol"))
        return "line";
    if (childByTag(el, "area_symbol"))
        return "area";
    if (childByTag(el, "text_symbol"))
        return "text";
    if (childByTag(el, "combined_symbol"))
        return "combined";
    return KIND_BY_TYPE[num(el, "type")] ?? "point";
}
/**
 * The element as a JSON-ready tree: attributes and children with keys in sorted
 * order, every colour number replaced by the colour's name and rgb, identity
 * (id, code, name, hidden) left out of every symbol, also nested ones, and a
 * combined symbol's references to other symbols replaced by their look.
 */
function canonical(el, r) {
    const isSymbol = el.localName === "symbol";
    const attrs = {};
    const names = Array.from(el.attributes, (a) => a.name).sort();
    const reference = el.localName === "part" &&
        !childByTag(el, "symbol") &&
        el.hasAttribute("symbol");
    for (const name of names) {
        if (isSymbol && IDENTITY_ATTRIBUTES.has(name))
            continue;
        if (reference && name === "symbol")
            continue;
        const value = el.getAttribute(name) ?? "";
        if (/(^|_)color$/.test(name) && /^-?\d+$/.test(value)) {
            const color = r.colors.get(Number(value));
            attrs[name] = color ? `${color.name} ${color.rgb}` : "none";
        }
        else {
            attrs[name] = value;
        }
    }
    const children = Array.from(el.childNodes).flatMap((n) => {
        if (n.nodeType === 1) {
            const child = n;
            if (isSymbol && NON_VISUAL_CHILDREN.has(child.localName))
                return [];
            return [canonical(child, r)];
        }
        const text = n.nodeType === 3 ? (n.nodeValue ?? "").trim() : "";
        return text ? [text] : [];
    });
    if (reference)
        children.push(r.look(num(el, "symbol", -1)));
    return { tag: el.localName, attrs, children };
}
/**
 * Parses an already-parsed `.omap` document into an `OmapModel`. Like `renderOmap`
 * it only reads the document, so it works with a browser `Document` and with one
 * from `@xmldom/xmldom`.
 */
export function parseOmapModel(doc) {
    const colorTable = parseColors(doc);
    const colors = [...colorTable.values()].map((c) => ({
        index: c.order,
        name: c.name,
        rgb: c.rgb,
        priority: c.order,
    }));
    const symbolEls = findByTag(doc, "symbols").flatMap((el) => childrenByTag(el, "symbol"));
    const active = new Set();
    const resolver = {
        colors: colorTable,
        look: (index) => {
            const el = symbolEls[index];
            if (!el || active.has(index))
                return "missing";
            active.add(index);
            const tree = canonical(el, resolver);
            active.delete(index);
            return tree;
        },
    };
    const symbols = symbolEls.map((el, index) => {
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
    const parts = findByTag(doc, "parts").flatMap((el) => childrenByTag(el, "part"));
    const objects = [];
    parts.forEach((partEl, part) => {
        for (const objectsEl of childrenByTag(partEl, "objects")) {
            for (const el of childrenByTag(objectsEl, "object")) {
                const points = parseCoords(childByTag(el, "coords"));
                if (points.length === 0)
                    continue;
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
