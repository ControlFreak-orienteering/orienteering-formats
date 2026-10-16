import { childByTag, childrenByTag, findByTag, parseCoords } from "./omap.js";
/**
 * Removes the objects outside the rectangle from the document.
 *
 * Objects without coordinates are kept: they cannot lie outside.
 *
 * @param doc - The parsed map; changed in place.
 * @param keep - The rectangle to keep, in map units.
 * @returns How many objects were kept.
 */
export function cropOmapDoc(doc, keep) {
    let kept = 0;
    for (const objects of findByTag(doc, "objects")) {
        for (const el of childrenByTag(objects, "object")) {
            const points = parseCoords(childByTag(el, "coords"));
            // A loop and not `Math.max(...points)`: a long object has more
            // points than a function takes arguments, see the renderer in omap.ts.
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const p of points) {
                if (p.x < minX)
                    minX = p.x;
                if (p.x > maxX)
                    maxX = p.x;
                if (p.y < minY)
                    minY = p.y;
                if (p.y > maxY)
                    maxY = p.y;
            }
            const inside = points.length === 0 ||
                (maxX >= keep.minX && minX <= keep.maxX && maxY >= keep.minY && minY <= keep.maxY);
            if (inside)
                kept++;
            else
                objects.removeChild(el);
        }
        // Mapper writes the count and reads it as a size hint.
        if (objects.hasAttribute("count")) {
            objects.setAttribute("count", String(childrenByTag(objects, "object").length));
        }
    }
    return kept;
}
/**
 * Crops a map file's text, with the browser's own XML parser and serializer.
 *
 * @param xml - The `.omap`/`.xmap` file's text.
 * @param keep - The rectangle to keep, in map units.
 * @returns The cropped file's text.
 */
export function cropOmapXml(xml, keep) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror"))
        throw new Error("the map could not be read");
    cropOmapDoc(doc, keep);
    const body = new XMLSerializer().serializeToString(doc);
    // The serializer leaves out the XML declaration. Mapper manages without
    // it, but the file should look as it did.
    const declaration = /^\s*<\?xml[^>]*\?>/.exec(xml)?.[0];
    return declaration && !body.startsWith("<?xml") ? `${declaration}\n${body}` : body;
}
