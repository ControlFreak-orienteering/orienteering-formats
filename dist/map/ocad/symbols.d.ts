import { BinaryReader } from "./binary-reader.js";
import type { OcadSymbol } from "./types.js";
interface SymbolIndexEntry {
    filePos: number;
}
/**
 * Walks the (possibly chained) symbol index blocks starting at
 * `firstBlockPos` and returns every symbol record's absolute file
 * position. Each entry addresses its symbol directly, independent of any
 * other symbol, so symbols never need to be read in file order.
 */
export declare function readSymbolIndex(reader: BinaryReader, firstBlockPos: number): SymbolIndexEntry[];
/**
 * Parses one symbol record. `version` selects which of the three known
 * on-disk layouts to use:
 *  - OCAD 10
 *  - OCAD 11 (and the otherwise-identical byte layout used by 12/2018 for
 *    everything except a handful of area-symbol pattern fields)
 *  - OCAD 12 / 2018 area-symbol variant
 *
 * OCAD versions before 10 use a materially different (16-bit-field, no
 * Unicode) layout and are not read by this parser yet.
 */
export declare function readSymbol(reader: BinaryReader, version: number, filePos: number, 
/** Receives what could be read but not drawn. See `onUnknown` in
 * elements.ts: a symbol that loses a part should say so, not just look
 * as if it were drawn that way. */
warn?: (message: string) => void): OcadSymbol | null;
export {};
