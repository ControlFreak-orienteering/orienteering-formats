/**
 * Crops an OpenOrienteering Mapper map to a rectangle.
 *
 * The same principle as for OCAD (ocad/crop.ts): an object that reaches
 * into the rectangle is kept whole, and the rest are removed from the
 * file. Only the map's own objects (those under `<parts>`) are tested. The
 * symbol definitions also hold `<object>` elements, as templates for how
 * the symbol is drawn, and they are left alone.
 *
 * The coordinates are the file's own: 1/1000 mm, y down. The same as the
 * drawn SVG, so the courses' coordinates apply directly.
 */
/** A rectangle in an OpenOrienteering Mapper file's own units (1/1000 mm, y down). */
export type OmapRect = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};
/**
 * Removes the objects outside the rectangle from the document.
 *
 * Objects without coordinates are kept: they cannot lie outside.
 *
 * @param doc - The parsed map; changed in place.
 * @param keep - The rectangle to keep, in map units.
 * @returns How many objects were kept.
 */
export declare function cropOmapDoc(doc: Document, keep: OmapRect): number;
/**
 * Crops a map file's text, with the browser's own XML parser and serializer.
 *
 * @param xml - The `.omap`/`.xmap` file's text.
 * @param keep - The rectangle to keep, in map units.
 * @returns The cropped file's text.
 */
export declare function cropOmapXml(xml: string, keep: OmapRect): string;
