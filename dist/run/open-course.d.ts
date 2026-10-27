/**
 * The id of a course's page on ControlFreak Live: runners who send their run to the site's
 * keyless address (`RUN_LIVE_OPEN_PATH` in `orienteering-formats/run-live`) are grouped by the
 * course they ran, and two links of the same course must meet on the same page.
 *
 * The id is the first 16 hex characters (64 bits) of the SHA-256 of a canonical text of the
 * course, see {@link openCourseKey}. The text holds what makes a course the same race: the
 * kind of course and its rules, the start, the controls' codes and positions, the finish.
 * Not the name, so a renamed course stays on its page.
 *
 * Positions are taken on the course link's own grid of 1e-5 degrees (about 1 m), so a
 * control moved by more than a metre or given another code makes another course. On a
 * score course the order of the controls carries no meaning, so they are sorted first.
 *
 * SHA-256 rather than a short non-cryptographic hash: anyone can send to the keyless address,
 * and a course made to collide with another must not land on its page. It is computed here,
 * synchronously, rather than with Web Crypto: `crypto.subtle` is asynchronous and missing on
 * plain-http pages, and the id is wanted while building a link. Any language (the server,
 * Run, the watch app's documentation) can still compute the same id from
 * {@link openCourseKey} with its own SHA-256.
 *
 * Compatibility: the id names pages that people link to. The canonical text and the hash
 * never change; `test/run-frozen.test.mjs` pins an id.
 */
import type { RunCourse } from "./course.js";
/** Length of a course id, in hex characters. */
export declare const OPEN_COURSE_ID_LENGTH = 16;
/**
 * The canonical text of a course that {@link openCourseId} hashes, ASCII:
 *
 *     oc1|<kind>|<start>|<controls>|<finish>
 *
 * - `kind`: `f` for a fixed order, `s<time limit>,<penalty per minute>` for a score course.
 * - `start`, `finish`: `<lat>,<lng>` as integers in 1e-5 degrees (`Math.round(deg * 1e5)`),
 *   or empty when the course has none.
 * - `controls`: `<code>,<lat>,<lng>` per control, with `,<points>` on a score course, joined
 *   by `;`. In course order, or on a score course sorted by code, then lat, lng, points.
 *
 * @param course - The course, as read from a course link.
 */
export declare function openCourseKey(course: RunCourse): string;
/**
 * The id of a course's page: the first {@link OPEN_COURSE_ID_LENGTH} hex characters of the
 * SHA-256 of {@link openCourseKey}.
 *
 * @param course - The course, or a course link: its data after `#`, with or without the `#`,
 *   or the whole link (everything up to the first `#` is ignored).
 * @returns The id, or null when the link holds no readable course.
 */
export declare function openCourseId(course: RunCourse | string): string | null;
