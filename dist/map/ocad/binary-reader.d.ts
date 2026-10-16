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
export declare class BinaryReader {
    readonly view: DataView;
    offset: number;
    private readonly marks;
    constructor(buffer: ArrayBuffer, offset?: number);
    get length(): number;
    /** Remaining bytes from the current offset to the end of the buffer. */
    get remaining(): number;
    byte(): number;
    int8(): number;
    /** Unsigned 16-bit ("Word"). */
    word(): number;
    /** Signed 16-bit ("SmallInt"). */
    smallInt(): number;
    /** Unsigned 32-bit ("Cardinal"). */
    cardinal(): number;
    /** Signed 32-bit ("Integer"/"LongInt"). */
    integer(): number;
    /** 64-bit IEEE double ("Real"/"Double"). */
    double(): number;
    skip(byteCount: number): void;
    /** Saves the current offset and jumps to a new one. Pair with pop(). */
    push(offset: number): void;
    /** Restores the offset saved by the matching push(). */
    pop(): void;
    /** Bytes consumed since the most recent push(). */
    sinceMark(): number;
    /**
     * A single-byte-length-prefixed 8-bit string (OCAD "PascalString"),
     * occupying a fixed `fieldSize` bytes in total (length byte + data).
     */
    pascalString(fieldSize: number): string;
    /**
     * A UTF-16LE code-unit string that may be zero-terminated or run for the
     * full fixed field width. Used for OCAD >= 9 symbol names/descriptions.
     */
    utf16FixedString(codeUnitCount: number): string;
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
    ocadText(codeUnitCount: number, unicode?: boolean): string;
    /**
     * Reads a NUL-terminated UTF-8 byte string starting at the current
     * offset, never looking past `maxBytes` or the end of the buffer — a
     * truncated or corrupt file must not send this scanning off the end.
     */
    cString(maxBytes?: number): string;
}
