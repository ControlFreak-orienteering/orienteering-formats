/**
 * Crops an OCAD file to a rectangle: only the objects that reach into the
 * rectangle are kept, and the file is rewritten from scratch so that it
 * really becomes smaller.
 *
 * Just removing the entries from the index would be simpler (it is what
 * OCAD does when you delete), but then the objects stay in the file and it
 * does not shrink. An object that reaches into the rectangle is kept whole,
 * also the part that lies outside: a contour or a forest area is not cut
 * in the middle. The edge becomes a little uneven, and no symbol breaks.
 *
 * The file header is copied as it is (the colour table and georeference
 * live in it and in the parameter strings, which come along), and the
 * three indexes are rebuilt with new positions. The records themselves are
 * moved unchanged.
 *
 * The coordinates are the file's own: 1/100 mm, y up.
 */

/** A rectangle in an OCAD file's own units (1/100 mm, y up). */
export type OcadRect = { minX: number; minY: number; maxX: number; maxY: number };

/** Thrown by `cropOcad` when the file cannot be cropped. */
export class OcadCropError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcadCropError";
  }
}

type Header = {
  version: number;
  symbolIndexBlockPos: number;
  objectIndexBlockPos: number;
  stringIndexBlockPos: number;
};

function readHeader(view: DataView): Header {
  if (view.byteLength < 60) throw new OcadCropError("too small for an OCAD file");
  if (view.getUint16(0, true) !== 0x0cad) throw new OcadCropError("not an OCAD file");
  return {
    version: view.getUint16(4, true),
    symbolIndexBlockPos: view.getUint32(8, true),
    objectIndexBlockPos: view.getUint32(12, true),
    stringIndexBlockPos: view.getUint32(32, true),
  };
}

type Entry = { at: number; pos: number };

/** The object index's live entries. OCAD 8 has 24 bytes per entry and no
 * status field; newer files 40 bytes and a status (1 normal, 2 hidden). */
function objectEntries(view: DataView, version: number, firstBlockPos: number): Entry[] {
  const old = version < 9;
  const entryBytes = old ? 24 : 40;
  const blockBytes = 4 + 256 * entryBytes;
  const entries: Entry[] = [];
  const visited = new Set<number>();
  let blockPos = firstBlockPos;
  while (blockPos > 0 && blockPos <= view.byteLength - blockBytes && !visited.has(blockPos)) {
    visited.add(blockPos);
    const next = view.getUint32(blockPos, true);
    for (let i = 0; i < 256; i++) {
      const at = blockPos + 4 + i * entryBytes;
      const pos = view.getUint32(at + 16, true);
      if (pos <= 0 || pos >= view.byteLength) continue;
      if (old) {
        if (view.getInt16(at + 22, true) > 0) entries.push({ at, pos });
      } else {
        const status = view.getUint8(at + 30);
        if (status === 1 || status === 2) entries.push({ at, pos });
      }
    }
    blockPos = next;
  }
  return entries;
}

/** The object's extent from its own coordinates, or null if it has
 * none. */
function objectExtent(view: DataView, version: number, pos: number): OcadRect | null {
  let nItem: number;
  let after: number;
  if (version < 9) {
    nItem = view.getUint16(pos + 4, true);
    after = pos + 32;
  } else if (version <= 11) {
    nItem = view.getUint32(pos + 8, true);
    after = pos + 40;
  } else {
    nItem = view.getUint32(pos + 44, true);
    after = pos + 56;
  }
  if (nItem <= 0 || after + nItem * 8 > view.byteLength) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < nItem; i++) {
    // The low eight bits are flags, see coords.ts.
    const x = view.getInt32(after + i * 8, true) >> 8;
    const y = view.getInt32(after + i * 8 + 4, true) >> 8;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** How long an object's record is: the header plus the coordinates and the text. */
function objectLength(view: DataView, version: number, pos: number): number {
  if (version < 9) return 32 + (view.getUint16(pos + 4, true) + view.getUint16(pos + 6, true)) * 8;
  if (version <= 11) {
    return 40 + (view.getUint32(pos + 8, true) + view.getUint16(pos + 12, true)) * 8;
  }
  return 56 + (view.getUint32(pos + 44, true) + view.getUint16(pos + 48, true)) * 8;
}

function indexBlocks(view: DataView, firstBlockPos: number, entryBytes: number): number[] {
  const blocks: number[] = [];
  const visited = new Set<number>();
  let pos = firstBlockPos;
  while (pos > 0 && !visited.has(pos) && pos + 4 + 256 * entryBytes <= view.byteLength) {
    visited.add(pos);
    blocks.push(pos);
    pos = view.getUint32(pos, true);
  }
  return blocks;
}

/**
 * The symbol records and how long they are.
 *
 * The length is first in the record, but the field is only informative
 * for OCAD and nothing the reader needs (see symbols.ts), and a file that
 * has it empty or wrong must not lose its symbols here: the map would
 * become a set of objects without any look. When the field cannot be
 * trusted, the length is counted to the next record in the file, whichever
 * it is.
 */
function symbolRecords(view: DataView, firstBlockPos: number, old: boolean, starts: number[]) {
  const positions: number[] = [];
  for (const block of indexBlocks(view, firstBlockPos, 4)) {
    for (let i = 0; i < 256; i++) {
      const pos = view.getUint32(block + 4 + i * 4, true);
      if (pos > 0 && pos < view.byteLength) positions.push(pos);
    }
  }
  const sorted = [...new Set([...starts, ...positions, view.byteLength])].sort((a, b) => a - b);
  // Binary search: a map has tens of thousands of records.
  const nextAfter = (pos: number) => {
    let lo = 0;
    let hi = sorted.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]! > pos) hi = mid;
      else lo = mid + 1;
    }
    return sorted[lo]! > pos ? sorted[lo]! : view.byteLength;
  };
  return positions.map((pos) => {
    const stated = old ? view.getUint16(pos, true) : view.getInt32(pos, true);
    const gap = nextAfter(pos) - pos;
    const size = stated > 0 && stated <= gap ? stated : gap;
    return { pos, size };
  });
}

/** The parameter strings: the entry in the index and the string it points to. */
function stringRecords(view: DataView, firstBlockPos: number) {
  const records: { at: number; pos: number; size: number }[] = [];
  for (const block of indexBlocks(view, firstBlockPos, 16)) {
    for (let i = 0; i < 256; i++) {
      const at = block + 4 + i * 16;
      const pos = view.getUint32(at, true);
      const size = view.getInt32(at + 4, true);
      const recordType = view.getInt32(at + 8, true);
      if (recordType > 0 && pos > 0 && size > 0 && pos + size <= view.byteLength) {
        records.push({ at, pos, size });
      }
    }
  }
  return records;
}

const touches = (o: OcadRect, r: OcadRect) =>
  o.maxX >= r.minX && o.minX <= r.maxX && o.maxY >= r.minY && o.minY <= r.maxY;

/**
 * The file with only the objects that reach into `keep`. Objects without
 * coordinates are kept: they cannot lie outside anything.
 *
 * @param buffer - The `.ocd` file's content.
 * @param keep - The rectangle to keep, in the file's units (1/100 mm, y up).
 * @returns The cropped file's content.
 * @throws OcadCropError for a file that is not OCAD or whose indexes are out of place.
 */
export function cropOcad(buffer: ArrayBuffer, keep: OcadRect): Uint8Array {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const header = readHeader(view);
  const old = header.version < 9;
  const entryBytes = old ? 24 : 40;

  const kept = objectEntries(view, header.version, header.objectIndexBlockPos)
    .filter((e) => {
      const extent = objectExtent(view, header.version, e.pos);
      return extent === null || touches(extent, keep);
    })
    .map((e) => ({ ...e, length: objectLength(view, header.version, e.pos) }))
    .filter((e) => e.pos + e.length <= bytes.byteLength);
  const strings = stringRecords(view, header.stringIndexBlockPos);
  // Where everything else in the file starts, so that a symbol's length can
  // be counted to the next record when it is not stated correctly, see
  // `symbolRecords`.
  const starts = [
    ...objectEntries(view, header.version, header.objectIndexBlockPos).map((e) => e.pos),
    ...strings.map((r) => r.pos),
    ...indexBlocks(view, header.symbolIndexBlockPos, 4),
    ...indexBlocks(view, header.objectIndexBlockPos, entryBytes),
    ...indexBlocks(view, header.stringIndexBlockPos, 16),
  ];
  const symbols = symbolRecords(view, header.symbolIndexBlockPos, old, starts);

  const SYMBOL_BLOCK = 4 + 256 * 4;
  const OBJECT_BLOCK = 4 + 256 * entryBytes;
  const STRING_BLOCK = 4 + 256 * 16;
  const blocksFor = (n: number) => Math.max(1, Math.ceil(n / 256));

  // The file header ends where the first index block starts.
  const headerBytes = Math.min(
    header.symbolIndexBlockPos,
    header.objectIndexBlockPos,
    header.stringIndexBlockPos,
  );
  if (!(headerBytes >= 60)) throw new OcadCropError("the file's indexes are out of place");

  const symbolBlocks = blocksFor(symbols.length);
  const objectBlocks = blocksFor(kept.length);
  const stringBlocks = blocksFor(strings.length);
  const symbolIndexAt = headerBytes;
  const objectIndexAt = symbolIndexAt + symbolBlocks * SYMBOL_BLOCK;
  const stringIndexAt = objectIndexAt + objectBlocks * OBJECT_BLOCK;
  const recordsAt = stringIndexAt + stringBlocks * STRING_BLOCK;
  const recordBytes =
    symbols.reduce((n, r) => n + r.size, 0) +
    strings.reduce((n, r) => n + r.size, 0) +
    kept.reduce((n, r) => n + r.length, 0);

  const out = new Uint8Array(recordsAt + recordBytes);
  const outView = new DataView(out.buffer);
  out.set(bytes.subarray(0, headerBytes));
  outView.setUint32(8, symbolIndexAt, true);
  outView.setUint32(12, objectIndexAt, true);
  outView.setUint32(32, stringIndexAt, true);

  let cursor = recordsAt;
  const copyRecord = (from: number, length: number) => {
    out.set(bytes.subarray(from, from + length), cursor);
    const at = cursor;
    cursor += length;
    return at;
  };

  /** Links the blocks together and writes one entry at a time. */
  const writeIndex = <T>(
    startAt: number,
    blockCount: number,
    blockBytes: number,
    items: T[],
    writeEntry: (at: number, item: T) => void,
  ) => {
    for (let b = 0; b < blockCount; b++) {
      const block = startAt + b * blockBytes;
      outView.setUint32(block, b + 1 < blockCount ? startAt + (b + 1) * blockBytes : 0, true);
    }
    items.forEach((item, i) => {
      const block = startAt + Math.floor(i / 256) * blockBytes;
      writeEntry(block + 4 + (i % 256) * ((blockBytes - 4) / 256), item);
    });
  };

  writeIndex(symbolIndexAt, symbolBlocks, SYMBOL_BLOCK, symbols, (at, r) => {
    outView.setUint32(at, copyRecord(r.pos, r.size), true);
  });
  writeIndex(objectIndexAt, objectBlocks, OBJECT_BLOCK, kept, (at, r) => {
    // The entry as it was (bounding rectangle, symbol, status), with only
    // the position changed.
    out.set(bytes.subarray(r.at, r.at + entryBytes), at);
    outView.setUint32(at + 16, copyRecord(r.pos, r.length), true);
  });
  writeIndex(stringIndexAt, stringBlocks, STRING_BLOCK, strings, (at, r) => {
    out.set(bytes.subarray(r.at, r.at + 16), at);
    outView.setUint32(at, copyRecord(r.pos, r.size), true);
  });

  return out;
}
