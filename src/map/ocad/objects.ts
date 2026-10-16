import { BinaryReader } from "./binary-reader.js";
import { readOcadPoints } from "./coords.js";
import type { MapObject, ObjectKind } from "./types.js";

interface ObjectIndexEntry {
  pos: number;
  status: number;
}

const OBJECT_STATUS_NORMAL = 1;
const OBJECT_STATUS_HIDDEN = 2;

const KIND_BY_OTP: Record<number, ObjectKind | undefined> = {
  1: "point",
  2: "line",
  3: "area",
  4: "text", // unformatted text
  5: "text", // formatted text
  6: "line", // line text (rendered as a plain line for now; caption text ignored)
};

/**
 * Walks the (possibly chained) object index blocks starting at
 * `firstBlockPos`, returning the file position of every non-deleted
 * object. Each 256-entry block is 4 + 256*40 bytes; a corrupt "next
 * block" pointer outside the file is treated as "no more blocks" rather
 * than followed.
 */
export function readObjectIndex(reader: BinaryReader, firstBlockPos: number): ObjectIndexEntry[] {
  const BLOCK_BYTES = 4 + 256 * 40;
  const entries: ObjectIndexEntry[] = [];
  // A corrupt chain can point back at an earlier block (or itself); without
  // this guard that would loop forever while `entries` grows without bound.
  const visited = new Set<number>();
  let blockPos = firstBlockPos;

  while (blockPos > 0 && blockPos <= reader.length - BLOCK_BYTES && !visited.has(blockPos)) {
    visited.add(blockPos);
    reader.push(blockPos);
    const nextBlockPos = reader.integer();
    for (let i = 0; i < 256; i++) {
      reader.skip(16); // bounding rectangle (min/max), not needed: we compute bounds from geometry
      const pos = reader.integer();
      reader.integer(); // stored byte length
      reader.integer(); // cached symbol number
      reader.byte(); // object type (re-read from the object body itself)
      reader.byte(); // encrypted-mode flag
      const status = reader.byte();
      reader.byte(); // view type
      reader.smallInt(); // color override (re-read from the object body)
      reader.smallInt(); // group
      reader.smallInt(); // import layer
      reader.byte();
      reader.byte();
      if (
        pos > 0 &&
        pos < reader.length &&
        (status === OBJECT_STATUS_NORMAL || status === OBJECT_STATUS_HIDDEN)
      ) {
        entries.push({ pos, status });
      }
    }
    reader.pop();
    blockPos = nextBlockPos;
  }

  return entries;
}

/** Bytes per coordinate pair (two 32-bit values). */
const COORD_BYTES = 8;

/**
 * Parses one object record. `version` selects the on-disk layout: OCAD
 * 9–11 share one 40-byte header (OpenOrienteering Mapper's `ObjectV9`,
 * reused unchanged for V10 and V11 — the newer versions only give meaning
 * to previously reserved fields), while OCAD 12/2018 reordered it and
 * added the object/database strings.
 */
export function readObject(
  reader: BinaryReader,
  version: number,
  filePos: number,
): MapObject | null {
  reader.push(filePos);
  try {
    const sym = reader.integer();
    const otp = reader.byte();
    reader.byte(); // OCAD 8 "Unicode" flag, "Customer" from OCAD 11 — text is always UTF-16 here (see ocadText)
    const angleRaw = reader.smallInt();

    let nItem: number;
    let nText: number;
    let color: number;

    if (version <= 11) {
      nItem = reader.cardinal();
      nText = reader.word();
      reader.byte(); // mark (V11)
      reader.byte(); // snapping mark (V11)
      color = reader.integer();
      reader.smallInt(); // line width override
      reader.smallInt(); // diameter/flags
      reader.integer(); // reserved (V11: server object id)
      reader.integer(); // height in 1/256 mm (V11)
      reader.integer(); // reserved
      reader.integer(); // height in mm (V10 only)
    } else {
      color = reader.integer();
      reader.smallInt(); // line width override
      reader.smallInt(); // diameter/flags
      reader.integer(); // server object id
      reader.integer(); // height
      reader.double(); // creation date
      reader.cardinal(); // multi-representation id
      reader.double(); // modification date
      nItem = reader.cardinal();
      nText = reader.word();
      reader.word(); // object-string length
      reader.word(); // database-string length
      reader.byte(); // object-string type
      reader.byte(); // reserved
    }

    // Refuse absurd counts up front instead of allocating a huge array and
    // then running off the end of the buffer one vertex at a time.
    if ((nItem + nText) * COORD_BYTES > reader.remaining) {
      throw new Error(
        `object at ${filePos} claims ${nItem} vertices + ${nText} text slots beyond end of file`,
      );
    }

    const coordinates = readOcadPoints(reader, nItem);
    // nText counts 8-byte coordinate slots reserved for the UTF-16 text,
    // i.e. four code units per slot.
    const text = reader.ocadText(nText * 4);

    const kind = KIND_BY_OTP[otp];
    if (!kind) return null;

    return {
      symNum: sym,
      kind,
      angle: angleRaw / 10, // stored in tenths of a degree
      color,
      coordinates,
      text,
    };
  } finally {
    reader.pop();
  }
}
