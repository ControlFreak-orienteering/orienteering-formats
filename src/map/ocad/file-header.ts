import { BinaryReader } from "./binary-reader.js";

/** Magic number every valid .ocd file starts with. */
export const OCAD_MAGIC = 0x0cad;

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
export function readFileHeader(reader: BinaryReader): FileHeader {
  if (reader.length < 60) {
    throw new Error("Not an OCAD file: too small to contain a file header.");
  }

  const magic = reader.word();
  if (magic !== OCAD_MAGIC) {
    throw new Error(
      `Not an OCAD file: bad magic number 0x${magic.toString(16)} (expected 0x0cad).`,
    );
  }

  reader.byte(); // file type / "section mark"
  reader.byte(); // file status (>= V9 only; unused before that)
  const version = reader.word();
  const subVersion = reader.byte();
  reader.byte(); // sub-sub-version (>= V10 only)

  const symbolIndexBlockPos = reader.cardinal();
  const objectIndexBlockPos = reader.cardinal();
  reader.integer(); // offline sync serial
  reader.integer(); // current file version
  reader.cardinal(); // reserved
  reader.cardinal(); // reserved
  const stringIndexBlockPos = reader.cardinal();
  reader.cardinal(); // file name position (legacy, rarely used)
  reader.cardinal(); // file name size
  reader.cardinal(); // reserved
  reader.cardinal(); // reserved
  reader.cardinal(); // reserved
  reader.cardinal(); // multi-representation start block position

  return {
    version,
    subVersion,
    symbolIndexBlockPos,
    objectIndexBlockPos,
    stringIndexBlockPos,
  };
}
