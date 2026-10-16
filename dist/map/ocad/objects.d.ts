import { BinaryReader } from "./binary-reader.js";
import type { MapObject } from "./types.js";
interface ObjectIndexEntry {
    pos: number;
    status: number;
}
/**
 * Walks the (possibly chained) object index blocks starting at
 * `firstBlockPos`, returning the file position of every non-deleted
 * object. Each 256-entry block is 4 + 256*40 bytes; a corrupt "next
 * block" pointer outside the file is treated as "no more blocks" rather
 * than followed.
 */
export declare function readObjectIndex(reader: BinaryReader, firstBlockPos: number): ObjectIndexEntry[];
/**
 * Parses one object record. `version` selects the on-disk layout: OCAD
 * 9–11 share one 40-byte header (OpenOrienteering Mapper's `ObjectV9`,
 * reused unchanged for V10 and V11 — the newer versions only give meaning
 * to previously reserved fields), while OCAD 12/2018 reordered it and
 * added the object/database strings.
 */
export declare function readObject(reader: BinaryReader, version: number, filePos: number): MapObject | null;
export {};
