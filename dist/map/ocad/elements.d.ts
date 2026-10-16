import { BinaryReader } from "./binary-reader.js";
import type { PointSymbolElement } from "./types.js";
/**
 * Reads the small drawing primitives ("symbol elements") that make up a
 * point symbol's graphic, or the primary/secondary/corner/start/end
 * decorations along a line symbol.
 *
 * `dataSizeCoords` is the budget OCAD wrote for the block, counted in
 * coordinates — the 8-byte unit the format measures everything in — and
 * each primitive's own 16-byte header counts as two of them. Reading it
 * as 16-bit words instead makes the budget a quarter of the block, so the
 * loop stops after the first primitive and every symbol drawn from more
 * than one loses the rest: a tower keeps its crossbar and loses its mast.
 *
 * The budget is an upper bound, and we stop early rather than throw if
 * the data stops making sense, since a partially-unreadable decoration
 * must never affect any other symbol — every symbol and object in the
 * file is addressed by its own absolute file offset, so a short read here
 * is strictly local.
 */
export declare function readSymbolElements(reader: BinaryReader, dataSizeCoords: number, 
/** Called with the type code of a primitive we do not recognise. It is
 * skipped and so becomes invisible; without this that happens silently,
 * and a symbol that loses a part just looks as if it were drawn that way. */
onUnknown?: (type: number) => void): PointSymbolElement[];
