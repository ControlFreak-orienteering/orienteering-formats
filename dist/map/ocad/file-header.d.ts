import { BinaryReader } from "./binary-reader.js";
/** Magic number every valid .ocd file starts with. */
export declare const OCAD_MAGIC = 3245;
/** The parts of the file header the reader uses. */
export interface FileHeader {
    version: number;
    subVersion: number;
    symbolIndexBlockPos: number;
    objectIndexBlockPos: number;
    stringIndexBlockPos: number;
}
/**
 * Reads the 60-byte file header shared (at the byte level) by OCAD versions
 * 8 through 2018 — later fields are simply unused by older files.
 * See OCAD's own "File" wiki page and the header layouts cross-checked
 * against OpenOrienteering Mapper's ocd_types*.h for the byte offsets.
 */
export declare function readFileHeader(reader: BinaryReader): FileHeader;
