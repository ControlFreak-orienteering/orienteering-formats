/**
 * The `.cfpack` file: a ControlFreak project *and* its map in one file.
 *
 * Layout (all integers little-endian):
 *
 *     offset  size  content
 *     0       6 B   ASCII "CFPACK" (the "magic", identifies the file type)
 *     6       2 B   format version, 16-bit unsigned
 *     8       4 B   header length n in bytes, 32-bit unsigned
 *     12      n B   header: UTF-8 JSON, the same envelope as a .cfproj file (see
 *                   `cfproj.ts`) plus a `map` field (`PackedMap`, or null)
 *     12+n          the map file's bytes, gzip-compressed or raw (the header says which)
 *
 * The header comes first and the map last, so a reader knows what the pack contains
 * before handling the (large) map.
 *
 * The container is binary rather than JSON because a 10 MB map would become 13 MB as
 * base64 inside a JSON string, and would have to be held in memory as a string before
 * use. Raw in a container, and gzipped, the same map is about 2 MB.
 */
import { envelopeToJson, parseProjectEnvelope, projectFileName, PROJECT_FORMAT_VERSION, } from "./cfproj.js";
import { FormatError } from "./errors.js";
/** File name ending used for packs. */
export const CFPACK_FILE_EXTENSION = ".cfpack";
/** The first six bytes of every pack. */
export const CFPACK_MAGIC = "CFPACK";
const HEADER_OFFSET = 12;
/**
 * Whether the bytes start like a `.cfpack` file.
 *
 * Checks the content rather than the file name, because a file that has passed through
 * e-mail or a file-sharing service may have lost or changed its extension.
 *
 * @param bytes - The start of the file; at least the first six bytes.
 */
export function hasCfpackMagic(bytes) {
    if (bytes.length < CFPACK_MAGIC.length)
        return false;
    for (let i = 0; i < CFPACK_MAGIC.length; i++) {
        if (bytes[i] !== CFPACK_MAGIC.charCodeAt(i))
            return false;
    }
    return true;
}
/**
 * Whether a file looks like a pack. Reads only the first six bytes, not the whole file.
 *
 * @param file - The file, e.g. from a file picker.
 */
export async function looksLikeCfpack(file) {
    if (file.size < CFPACK_MAGIC.length)
        return false;
    try {
        return hasCfpackMagic(new Uint8Array(await file.slice(0, CFPACK_MAGIC.length).arrayBuffer()));
    }
    catch {
        return false;
    }
}
/**
 * A pack file name any file system accepts, made from a project name.
 *
 * @param projectName - The project's name.
 */
export function cfpackFileName(projectName) {
    return projectFileName(projectName, CFPACK_FILE_EXTENSION);
}
/**
 * Gzip, when the runtime can.
 *
 * `CompressionStream` exists in every current browser and in Node 18+, but if it is
 * missing the pack is still written, only larger. The header says which it became.
 */
async function compress(bytes) {
    if (typeof CompressionStream === "undefined")
        return { bytes, encoding: "raw" };
    try {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
        return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), encoding: "gzip" };
    }
    catch {
        return { bytes, encoding: "raw" };
    }
}
async function decompress(bytes, encoding) {
    if (encoding === "raw")
        return bytes;
    if (typeof DecompressionStream === "undefined")
        throw new FormatError("unreadable");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}
/**
 * Builds a pack.
 *
 * The map is stored exactly as given, so whoever opens the pack gets the original file
 * back.
 *
 * @param envelope - The project, see `createProjectEnvelope`.
 * @param map - The map file, or `null` for a pack without a map.
 */
export async function writeCfpack(envelope, map) {
    let body = new Uint8Array(0);
    let packed = null;
    if (map) {
        const raw = map.bytes instanceof Uint8Array ? map.bytes : new Uint8Array(await map.bytes.arrayBuffer());
        const { bytes, encoding } = await compress(raw);
        body = bytes;
        packed = { name: map.name, id: map.id, encoding, byteLength: raw.byteLength };
    }
    const header = { ...envelopeToJson(envelope), map: packed };
    const headerBytes = new TextEncoder().encode(JSON.stringify(header));
    const prefix = new Uint8Array(HEADER_OFFSET);
    const view = new DataView(prefix.buffer);
    for (let i = 0; i < CFPACK_MAGIC.length; i++)
        prefix[i] = CFPACK_MAGIC.charCodeAt(i);
    view.setUint16(6, PROJECT_FORMAT_VERSION, true);
    view.setUint32(8, headerBytes.byteLength, true);
    return new Blob([prefix, headerBytes, body], {
        type: "application/octet-stream",
    });
}
/**
 * Reads a pack.
 *
 * The contents come from outside: every length is checked against what is actually
 * there, and the header goes through the same checks as a `.cfproj` file. A cut-short
 * or invented file gives a `FormatError`, never a crash.
 *
 * @param data - The whole file.
 * @throws {FormatError} `wrong-format` if it is not a pack, `newer-version` if a newer
 *   format version wrote it, `unreadable` if it is damaged.
 */
export async function readCfpack(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bytes.byteLength < HEADER_OFFSET || !hasCfpackMagic(bytes)) {
        throw new FormatError("wrong-format");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint16(6, true) > PROJECT_FORMAT_VERSION) {
        // Written by a newer version: say so plainly rather than read half the pack and
        // silently drop what we do not understand.
        throw new FormatError("newer-version");
    }
    const headerLength = view.getUint32(8, true);
    const bodyStart = HEADER_OFFSET + headerLength;
    if (bodyStart > bytes.byteLength)
        throw new FormatError("unreadable");
    let header;
    try {
        header = JSON.parse(new TextDecoder().decode(bytes.subarray(HEADER_OFFSET, bodyStart)));
    }
    catch {
        throw new FormatError("unreadable");
    }
    const envelope = parseProjectEnvelope(header);
    const packed = packedMapOf(header);
    if (!packed)
        return { envelope, map: null };
    let raw;
    try {
        raw = await decompress(bytes.subarray(bodyStart), packed.encoding);
    }
    catch {
        throw new FormatError("unreadable");
    }
    if (raw.byteLength !== packed.byteLength) {
        // The length in the header and the map that came out must agree. If they do not,
        // the file is damaged, and guessing at half a map helps no one.
        throw new FormatError("unreadable");
    }
    // A raw map is a view into the caller's buffer; copy it so the result owns its bytes.
    if (packed.encoding === "raw")
        raw = raw.slice();
    return { envelope, map: { bytes: raw, name: packed.name, id: packed.id } };
}
function packedMapOf(header) {
    if (typeof header !== "object" || header === null)
        return null;
    const map = header["map"];
    if (typeof map !== "object" || map === null)
        return null;
    const m = map;
    const name = typeof m["name"] === "string" ? m["name"] : "";
    const id = typeof m["id"] === "string" ? m["id"] : "";
    const byteLength = typeof m["byteLength"] === "number" ? m["byteLength"] : -1;
    const encoding = m["encoding"] === "gzip" ? "gzip" : m["encoding"] === "raw" ? "raw" : null;
    if (!name || !encoding || byteLength < 0)
        return null;
    return { name, id, encoding, byteLength };
}
