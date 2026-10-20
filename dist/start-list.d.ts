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
/** The format's name in the file. */
export declare const START_LIST_FORMAT = "cf-startlist";
/** The version this package writes. */
export declare const START_LIST_VERSION = 1;
/** One runner in a start list. */
export interface StartListRunner {
    /** Start time as a clock time, "HH:MM:SS". */
    time: string;
    name: string;
    club?: string;
    /** Class short name, e.g. "H21". */
    class?: string;
    /** SportIdent card number. */
    card?: number;
    /** The start the runner starts at, when the competition has several, e.g. "S1". */
    start?: string;
    /** The course's name, e.g. "Bana 3". */
    course?: string;
    /** Entered after the draw (efteranmäld). */
    late?: boolean;
}
/** A start list as written and read. */
export interface StartList {
    /** When the list was made (ISO 8601), on the sending computer. */
    createdAt: string;
    competition: {
        name: string;
        date: string;
    };
    runners: StartListRunner[];
}
/**
 * Writes a start list as JSON text, e.g. to send as a QR film.
 *
 * @param list - The list; runners in start order.
 */
export declare function writeStartList(list: StartList): string;
/**
 * Reads a start list written by {@link writeStartList}, by this or a later version.
 * Runners without a valid time or name are left out rather than failing the list.
 *
 * @throws {@link FormatError} `wrong-format` if the text is not a start list, or
 *   `unreadable` if it is one but damaged.
 */
export declare function readStartList(json: string): StartList;
