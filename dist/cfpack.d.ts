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
import { type ProjectEnvelope } from "./cfproj.js";
/** File name ending used for packs. */
export declare const CFPACK_FILE_EXTENSION = ".cfpack";
/** The first six bytes of every pack. */
export declare const CFPACK_MAGIC = "CFPACK";
/** The map as described in the pack header. */
export type PackedMap = {
    /** The map file's name, so it can be handed back as a real file. */
    name: string;
    /** The map file's content hash. */
    id: string;
    /** How the map bytes are stored after the header. */
    encoding: "gzip" | "raw";
    /** The map file's size in bytes *before* packing, as a sanity check. */
    byteLength: number;
};
/** A map file to put in a pack. */
export type MapToPack = {
    /** The file's contents. */
    bytes: Blob | Uint8Array;
    /** The file's name. */
    name: string;
    /** The file's content hash. */
    id: string;
};
/** A pack's contents. */
export type CfpackContents = {
    /** The project, as in a `.cfproj` file. */
    envelope: ProjectEnvelope;
    /** The map file, unpacked and byte for byte the original. `null` if the pack has none. */
    map: {
        bytes: Uint8Array;
        name: string;
        id: string;
    } | null;
};
/**
 * Whether the bytes start like a `.cfpack` file.
 *
 * Checks the content rather than the file name, because a file that has passed through
 * e-mail or a file-sharing service may have lost or changed its extension.
 *
 * @param bytes - The start of the file; at least the first six bytes.
 */
export declare function hasCfpackMagic(bytes: Uint8Array): boolean;
/**
 * Whether a file looks like a pack. Reads only the first six bytes, not the whole file.
 *
 * @param file - The file, e.g. from a file picker.
 */
export declare function looksLikeCfpack(file: Blob): Promise<boolean>;
/**
 * A pack file name any file system accepts, made from a project name.
 *
 * @param projectName - The project's name.
 */
export declare function cfpackFileName(projectName: string): string;
/**
 * Builds a pack.
 *
 * The map is stored exactly as given, so whoever opens the pack gets the original file
 * back.
 *
 * @param envelope - The project, see `createProjectEnvelope`.
 * @param map - The map file, or `null` for a pack without a map.
 */
export declare function writeCfpack(envelope: ProjectEnvelope, map: MapToPack | null): Promise<Blob>;
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
export declare function readCfpack(data: ArrayBuffer | Uint8Array): Promise<CfpackContents>;
