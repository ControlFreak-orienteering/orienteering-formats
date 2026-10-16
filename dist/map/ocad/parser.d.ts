import type { ParsedOcadMap } from "./types.js";
/**
 * Parses an .ocd file into a version-independent `ParsedOcadMap`.
 *
 * Supports OCAD 8, and 10 through 2018. OCAD 8 has its own layout — the
 * colours live in the file header, the symbol and object records use
 * 16-bit fields — and is read by v8.ts, which produces the same
 * `ParsedOcadMap` so nothing downstream needs to know which it was.
 *
 * OCAD 9 sits between the two and is not read: it is rare enough that
 * nobody has put a file in front of this parser, and guessing at which of
 * the two layouts it follows would mis-parse rather than refuse.
 */
export declare function parseOcadFile(buffer: ArrayBuffer): ParsedOcadMap;
