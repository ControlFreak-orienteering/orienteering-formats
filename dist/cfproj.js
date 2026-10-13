/**
 * The `.cfproj` file: a ControlFreak project as JSON, without the map.
 *
 * The same JSON object (the "envelope") is also the header of a `.cfpack`, see
 * `cfpack.ts`. Its fields:
 *
 *     format     "controlfreak-project"
 *     version    format version, currently 1
 *     writtenBy  name of the app that wrote the file; information only
 *     savedAt    milliseconds since 1970
 *     project    name, map file name, map content hash, scale and origin
 *     work       the writing app's own course model; this package does not read it
 *     exchange   optional, see `exchange.ts`; what other apps should read
 *
 * The map is not in the file: it is megabytes, and whoever opens the project nearly
 * always has it already. The file carries the map's name and content hash instead, so
 * the app can ask for the right file and recognise it.
 */
import { FormatError } from "./errors.js";
import { parseCourseExchange } from "./exchange.js";
/** File name ending used for project files. */
export const CFPROJ_FILE_EXTENSION = ".cfproj";
/** The `format` field of every project file and pack header. */
export const PROJECT_FORMAT = "controlfreak-project";
/**
 * The format version this package writes, and the newest it reads.
 *
 * The same number is used in the `.cfpack` prefix. Optional additions such as
 * `exchange` do not change it.
 */
export const PROJECT_FORMAT_VERSION = 1;
/**
 * Builds an envelope to write.
 *
 * @param opts.writtenBy - Name of the app writing the file.
 * @param opts.project - The project's own facts.
 * @param opts.work - The app's own course model, or `null`.
 * @param opts.exchange - The exchange section, or `null` to leave it out.
 * @param opts.savedAt - When the file is written; defaults to now.
 */
export function createProjectEnvelope(opts) {
    return {
        format: PROJECT_FORMAT,
        version: PROJECT_FORMAT_VERSION,
        writtenBy: opts.writtenBy,
        savedAt: opts.savedAt ?? Date.now(),
        project: { ...opts.project },
        work: opts.work ?? null,
        exchange: opts.exchange ?? null,
    };
}
/**
 * The envelope as a plain object ready for `JSON.stringify`, with the fields in their
 * usual order and `exchange` left out when there is none.
 */
export function envelopeToJson(envelope) {
    const { exchange, ...rest } = envelope;
    return exchange ? { ...rest, exchange } : rest;
}
/**
 * The text of a `.cfproj` file.
 *
 * Indented on purpose: it costs a few kilobytes and makes the file understandable to
 * someone who opens it in a text editor.
 *
 * @param envelope - What to write, see `createProjectEnvelope`.
 */
export function writeProjectFile(envelope) {
    return JSON.stringify(envelopeToJson(envelope), null, 2);
}
/**
 * Reads the text of a `.cfproj` file.
 *
 * @param text - The file's contents.
 * @throws {FormatError} `unreadable` if it is not JSON, otherwise as
 *   `parseProjectEnvelope`.
 */
export function readProjectFile(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new FormatError("unreadable");
    }
    return parseProjectEnvelope(parsed);
}
const isObj = (v) => typeof v === "object" && v !== null;
const str = (v) => (typeof v === "string" ? v : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
/**
 * Checks an envelope that has already been parsed from JSON.
 *
 * Used for `.cfproj` files and for the header of a `.cfpack`. The contents come from
 * outside and are taken apart field by field; `work` is passed through unread.
 *
 * @param parsed - The parsed JSON.
 * @throws {FormatError} `wrong-format` if it is not a project, `newer-version` if a
 *   newer format version wrote it.
 */
export function parseProjectEnvelope(parsed) {
    if (!isObj(parsed) || parsed["format"] !== PROJECT_FORMAT) {
        throw new FormatError("wrong-format");
    }
    const version = num(parsed["version"]) ?? 0;
    if (version > PROJECT_FORMAT_VERSION) {
        // Say so plainly rather than read half the file and silently drop what we do not
        // understand.
        throw new FormatError("newer-version");
    }
    const p = isObj(parsed["project"]) ? parsed["project"] : {};
    return {
        format: PROJECT_FORMAT,
        version,
        writtenBy: str(parsed["writtenBy"]) ?? "",
        savedAt: num(parsed["savedAt"]) ?? 0,
        project: {
            name: str(p["name"])?.trim() || "",
            mapName: str(p["mapName"]),
            mapId: str(p["mapId"]),
            scale: num(p["scale"]),
            origin: str(p["origin"]) || null,
        },
        work: parsed["work"] ?? null,
        exchange: parseCourseExchange(parsed["exchange"]),
    };
}
/**
 * A file name any file system accepts, made from a project name.
 *
 * @param projectName - The project's name.
 * @param extension - The ending, e.g. `CFPROJ_FILE_EXTENSION`.
 * @param fallback - Used when the name is empty; defaults to `"projekt"`.
 */
export function projectFileName(projectName, extension, fallback = "projekt") {
    const safe = projectName
        .trim()
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, " ")
        .slice(0, 80);
    return `${safe || fallback}${extension}`;
}
