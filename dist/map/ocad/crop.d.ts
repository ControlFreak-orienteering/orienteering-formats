/**
 * Crops an OCAD file to a rectangle: only the objects that reach into the
 * rectangle are kept, and the file is rewritten from scratch so that it
 * really becomes smaller.
 *
 * Just removing the entries from the index would be simpler (it is what
 * OCAD does when you delete), but then the objects stay in the file and it
 * does not shrink. An object that reaches into the rectangle is kept whole,
 * also the part that lies outside: a contour or a forest area is not cut
 * in the middle. The edge becomes a little uneven, and no symbol breaks.
 *
 * The file header is copied as it is (the colour table and georeference
 * live in it and in the parameter strings, which come along), and the
 * three indexes are rebuilt with new positions. The records themselves are
 * moved unchanged.
 *
 * The coordinates are the file's own: 1/100 mm, y up.
 */
/** A rectangle in an OCAD file's own units (1/100 mm, y up). */
export type OcadRect = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};
/** Thrown by `cropOcad` when the file cannot be cropped. */
export declare class OcadCropError extends Error {
    constructor(message: string);
}
/**
 * The file with only the objects that reach into `keep`. Objects without
 * coordinates are kept: they cannot lie outside anything.
 *
 * @param buffer - The `.ocd` file's content.
 * @param keep - The rectangle to keep, in the file's units (1/100 mm, y up).
 * @returns The cropped file's content.
 * @throws OcadCropError for a file that is not OCAD or whose indexes are out of place.
 */
export declare function cropOcad(buffer: ArrayBuffer, keep: OcadRect): Uint8Array;
