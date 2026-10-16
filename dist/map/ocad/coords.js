/**
 * OCAD packs per-vertex flags into the low 8 bits of each of the x and y
 * 32-bit values, with the actual 1/100 mm coordinate in the remaining 24
 * bits (arithmetic right-shift by 8 recovers the signed coordinate).
 * This applies uniformly to every coordinate pair in the format: object
 * geometry, symbol-element geometry, and index bounding rectangles.
 */
export function readOcadPoint(reader) {
    const rawX = reader.integer();
    const rawY = reader.integer();
    const x = rawX >> 8;
    const y = rawY >> 8;
    const xFlags = rawX & 0xff;
    const yFlags = rawY & 0xff;
    return {
        x,
        y,
        bezierFirst: (xFlags & 0x01) !== 0,
        bezierSecond: (xFlags & 0x02) !== 0,
        corner: (yFlags & 0x01) !== 0,
        holeStart: (yFlags & 0x02) !== 0,
    };
}
/** Reads `count` points in a row, see `readOcadPoint`. */
export function readOcadPoints(reader, count) {
    const points = new Array(count);
    for (let i = 0; i < count; i++)
        points[i] = readOcadPoint(reader);
    return points;
}
