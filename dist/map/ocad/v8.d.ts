/**
 * OCAD 8: maps from before the format the rest of this folder reads.
 *
 * The files are still around. A club map drawn in 2003 stays in its OCAD 8
 * file until someone opens it in a newer program, and if nobody does, the
 * file is still the only one there is. The format is documented and read
 * by, among others, OpenOrienteering Mapper; the record layouts here follow
 * its description of the format (src/fileformats/ocd_types_v8.h) and were
 * checked against a real file.
 *
 * Three things differ, and they are why a path of its own is needed:
 *
 *  - The colours live in the file header, not as parameter strings. An
 *    OCAD 8 file has no record type 9 at all.
 *  - The symbol header is shorter and has 16-bit fields where newer files
 *    have 32. The symbol number carries one decimal instead of three.
 *  - The object index has 24 bytes per entry instead of 40, and an
 *    object's text is single-byte unless the object says otherwise.
 *
 * What does *not* differ is left unchanged: the packing of coordinates,
 * the symbols' drawing primitives and the line symbols' body are the same
 * byte for byte, and are read with the same code as newer files.
 */
import { BinaryReader } from "./binary-reader.js";
import type { MapObject, OcadColor, OcadSymbol } from "./types.js";
/**
 * The colour table from an OCAD 8 file header.
 *
 * @param reader - A reader over the whole file.
 * @returns The colours, in the same order convention as newer files.
 */
export declare function readColorsV8(reader: BinaryReader): OcadColor[];
/**
 * The symbols and objects in an OCAD 8 file. The colours are read on their
 * own, see `readColorsV8`.
 */
export declare function readSymbolsAndObjectsV8(reader: BinaryReader, symbolIndexBlockPos: number, objectIndexBlockPos: number, warnings: string[]): {
    symbols: OcadSymbol[];
    objects: MapObject[];
};
