/**
 * A start list for the start clock (startklocka): who starts when, sent from ControlFreak Event,
 * typically as a QR film (see `qr-film.ts`) to a phone or tablet at the start.
 *
 * JSON with a format name and a version, so that a start clock built against version 1 can
 * keep reading lists from later versions of ControlFreak Event:
 *
 * ```json
 * {
 *   "format": "cf-startlist",
 *   "version": 1,
 *   "createdAt": "2026-10-18T08:42:00.000Z",
 *   "competition": { "name": "Vårspringet", "date": "2026-10-18" },
 *   "runners": [
 *     { "time": "10:02:00", "name": "Anna Ek", "club": "OK Ravinen", "class": "D21",
 *       "card": 123456, "start": "S1", "course": "Bana 3", "late": false }
 *   ]
 * }
 * ```
 *
 * - `time` is the start time as a clock time ("HH:MM:SS"), in the competition's own time
 *   zone, as shown on the start clock.
 * - `name` and `time` are required per runner; the rest is optional and may grow. Later
 *   versions only add fields, and readers ignore fields they do not know, so a newer list
 *   still reads here. A list whose version is newer than this reader knows is still read
 *   if its rows look as expected.
 * - Vacancies and runners without a start time are left out by the sender.
 */
import { FormatError } from "./errors.js";
/** The format's name in the file. */
export const START_LIST_FORMAT = "cf-startlist";
/** The version this package writes. */
export const START_LIST_VERSION = 1;
/** A clock time "HH:MM:SS" (or "HH:MM"). */
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
/**
 * Writes a start list as JSON text, e.g. to send as a QR film.
 *
 * @param list - The list; runners in start order.
 */
export function writeStartList(list) {
    return JSON.stringify({ format: START_LIST_FORMAT, version: START_LIST_VERSION, ...list });
}
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v) => typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
/**
 * Reads a start list written by {@link writeStartList}, by this or a later version.
 * Runners without a valid time or name are left out rather than failing the list.
 *
 * @throws {@link FormatError} `wrong-format` if the text is not a start list, or
 *   `unreadable` if it is one but damaged.
 */
export function readStartList(json) {
    let data;
    try {
        data = JSON.parse(json);
    }
    catch {
        throw new FormatError("wrong-format");
    }
    if (!isObject(data) || data["format"] !== START_LIST_FORMAT) {
        throw new FormatError("wrong-format");
    }
    if (typeof data["version"] !== "number" || !Array.isArray(data["runners"])) {
        throw new FormatError("unreadable");
    }
    const competition = isObject(data["competition"]) ? data["competition"] : {};
    const runners = [];
    for (const row of data["runners"]) {
        if (!isObject(row))
            continue;
        const time = text(row["time"]);
        const name = text(row["name"]);
        if (!time || !CLOCK_TIME.test(time) || !name)
            continue;
        const runner = { time: time.length === 5 ? `${time}:00` : time, name };
        const club = text(row["club"]);
        const cls = text(row["class"]);
        const start = text(row["start"]);
        const course = text(row["course"]);
        if (club)
            runner.club = club;
        if (cls)
            runner.class = cls;
        if (typeof row["card"] === "number" && Number.isInteger(row["card"]))
            runner.card = row["card"];
        if (start)
            runner.start = start;
        if (course)
            runner.course = course;
        if (row["late"] === true)
            runner.late = true;
        runners.push(runner);
    }
    return {
        createdAt: text(data["createdAt"]) ?? "",
        competition: {
            name: text(competition["name"]) ?? "",
            date: text(competition["date"]) ?? "",
        },
        runners,
    };
}
