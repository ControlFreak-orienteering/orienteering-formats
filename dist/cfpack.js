/**
 * The `.cfpack` file: a ControlFreak project *and* its map in one file.
 *
 * Layout (all integers little-endian):
 *
 *     offset  size  content
 *     0       6 B   ASCII "CFPACK" (the "magic", identifies the file type)
 *     6       2 B   format version, 16-bit unsigned
 *     8       4 B   header length n in bytes, 32-bit unsigned
 *     12      n B   header: UTF-8 JSON, the same as a .cfproj file plus a `map` field
 *     12+n          the map file's bytes, gzip-compressed or raw (the header says which)
 *
 * The header comes first and the map last, so a reader knows what the pack contains
 * before handling the (large) map.
 *
 * This first version only recognises the file type. Reading the header and the map
 * moves here from ControlFreak (`src/lib/project-pack.ts`) in a later version.
 */
/** File name ending used for packs. */
export const CFPACK_FILE_EXTENSION = ".cfpack";
/** The first six bytes of every pack. */
export const CFPACK_MAGIC = "CFPACK";
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
