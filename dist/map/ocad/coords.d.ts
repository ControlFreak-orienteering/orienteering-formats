import { BinaryReader } from "./binary-reader.js";
import type { OcadPoint } from "./types.js";
/**
 * OCAD packs per-vertex flags into the low 8 bits of each of the x and y
 * 32-bit values, with the actual 1/100 mm coordinate in the remaining 24
 * bits (arithmetic right-shift by 8 recovers the signed coordinate).
 * This applies uniformly to every coordinate pair in the format: object
 * geometry, symbol-element geometry, and index bounding rectangles.
 */
export declare function readOcadPoint(reader: BinaryReader): OcadPoint;
/** Reads `count` points in a row, see `readOcadPoint`. */
export declare function readOcadPoints(reader: BinaryReader, count: number): OcadPoint[];
