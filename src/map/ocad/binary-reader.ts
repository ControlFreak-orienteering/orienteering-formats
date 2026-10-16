/**
 * Little-endian binary cursor over an ArrayBuffer.
 *
 * OCAD is a Delphi/Pascal application, so its own file-format documentation
 * describes fields using Pascal type names (Cardinal, SmallInt, Word, ...).
 * We keep those names here because they are the vocabulary the format is
 * documented in, which makes this module easy to check against the spec.
 *
 * All multi-byte values in an .ocd file are stored little-endian.
 */
export class BinaryReader {
  readonly view: DataView;
  offset: number;
  private readonly marks: number[] = [];

  constructor(buffer: ArrayBuffer, offset = 0) {
    this.view = new DataView(buffer);
    this.offset = offset;
  }

  get length(): number {
    return this.view.byteLength;
  }

  /** Remaining bytes from the current offset to the end of the buffer. */
  get remaining(): number {
    return this.view.byteLength - this.offset;
  }

  byte(): number {
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  int8(): number {
    const v = this.view.getInt8(this.offset);
    this.offset += 1;
    return v;
  }

  /** Unsigned 16-bit ("Word"). */
  word(): number {
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  /** Signed 16-bit ("SmallInt"). */
  smallInt(): number {
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }

  /** Unsigned 32-bit ("Cardinal"). */
  cardinal(): number {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  /** Signed 32-bit ("Integer"/"LongInt"). */
  integer(): number {
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  /** 64-bit IEEE double ("Real"/"Double"). */
  double(): number {
    const v = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return v;
  }

  skip(byteCount: number): void {
    this.offset += byteCount;
  }

  /** Saves the current offset and jumps to a new one. Pair with pop(). */
  push(offset: number): void {
    this.marks.push(this.offset);
    this.offset = offset;
  }

  /** Restores the offset saved by the matching push(). */
  pop(): void {
    const restored = this.marks.pop();
    if (restored === undefined) throw new Error("BinaryReader: pop() without matching push()");
    this.offset = restored;
  }

  /** Bytes consumed since the most recent push(). */
  sinceMark(): number {
    const mark = this.marks[this.marks.length - 1];
    if (mark === undefined) throw new Error("BinaryReader: sinceMark() without an active push()");
    return this.offset - mark;
  }

  /**
   * A single-byte-length-prefixed 8-bit string (OCAD "PascalString"),
   * occupying a fixed `fieldSize` bytes in total (length byte + data).
   */
  pascalString(fieldSize: number): string {
    const len = this.byte();
    const bytes = new Uint8Array(
      this.view.buffer,
      this.view.byteOffset + this.offset,
      Math.max(0, fieldSize - 1),
    );
    this.offset += fieldSize - 1;
    const usable = Math.min(len, bytes.length);
    return latin1Decode(bytes.subarray(0, usable));
  }

  /**
   * A UTF-16LE code-unit string that may be zero-terminated or run for the
   * full fixed field width. Used for OCAD >= 9 symbol names/descriptions.
   */
  utf16FixedString(codeUnitCount: number): string {
    let out = "";
    let ended = false;
    for (let i = 0; i < codeUnitCount; i++) {
      const c = this.word();
      if (c === 0) ended = true;
      if (!ended) out += String.fromCharCode(c);
    }
    return out;
  }

  /**
   * OCAD's variable-length object text. From OCAD 9 on the text is always
   * UTF-16LE (there is no per-object encoding flag any more — the byte
   * OCAD 8 used for it is "Customer" in later versions); the 8-bit variant
   * is kept only for completeness. `codeUnitCount` is the room reserved
   * for the text, not its length: OCAD's `nText` counts 8-byte coordinate
   * slots, so callers pass `nText * 4` code units (or `nText * 8` bytes).
   * Reading stops at the first NUL or at the end of the buffer. '\r' is
   * dropped (OCAD stores line breaks as "\r\n").
   */
  ocadText(codeUnitCount: number, unicode = true): string {
    const unitBytes = unicode ? 2 : 1;
    const count = Math.min(
      Math.max(0, codeUnitCount),
      Math.floor(Math.max(0, this.remaining) / unitBytes),
    );
    let out = "";
    for (let i = 0; i < count; i++) {
      const c = unicode ? this.word() : this.byte();
      if (c === 0) break;
      if (c !== 13) out += String.fromCharCode(c);
    }
    return out.trim();
  }

  /**
   * Reads a NUL-terminated UTF-8 byte string starting at the current
   * offset, never looking past `maxBytes` or the end of the buffer — a
   * truncated or corrupt file must not send this scanning off the end.
   */
  cString(maxBytes: number = this.remaining): string {
    const start = Math.min(this.offset, this.view.byteLength);
    const limit = Math.min(this.view.byteLength, start + Math.max(0, maxBytes));
    let end = start;
    while (end < limit && this.view.getUint8(end) !== 0) end++;
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + start, end - start);
    this.offset = Math.min(end + 1, this.view.byteLength);
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function latin1Decode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b === 0) break;
    s += String.fromCharCode(b);
  }
  return s;
}
