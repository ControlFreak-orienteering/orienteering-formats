/**
 * Reads courses from Purple Pen files (.ppen).
 *
 * Purple Pen (purplepen.golde.org) is a free course-setting program. Its project file
 * is XML with the root `<course-scribe-event>`. The parts read here:
 *
 * - `<event><title>` and `<map scale="15000">karta.ocd</map>`: the event's name, the
 *   map's scale and the map file the courses were set on.
 * - `<control id kind>` with `<code>` and `<location x y>`: the points. `kind` is
 *   `start`, `normal`, `finish`, `crossing-point`, `map-issue` or `map-exchange`.
 *   Locations are millimetres on the map with y upwards, from the map file's origin.
 * - `<course id kind order>` with `<name>`, `<first course-control>` and
 *   `<options climb course-length>`. `kind` is `normal` or `score`.
 * - `<course-control id control points>` with `<next course-control>`: a linked list
 *   from the course's first course-control to its finish.
 *
 * A `.ppen` has no positions on the earth. Where the map lies is in the map file it
 * names, so an app that needs `lat`/`lng` reads that map's georeference (see
 * `orienteering-formats/map`) and converts the millimetres.
 *
 * Purple Pen does not store course lengths unless the course setter typed one in; it
 * computes them from the control positions. This reader does the same with straight
 * legs, so lengths can differ slightly from Purple Pen's when legs are bent around
 * obstacles.
 *
 * Forked courses (`variation="fork"` or `"loop"` on course-controls) are read along
 * their first variation only and marked `partlyRead`, so the app can tell the user.
 *
 * The format was studied from Purple Pen's documentation and sample files; no Purple
 * Pen code is used.
 */
import type { CourseSet } from "../courses.js";
import { type XmlParse } from "../xml.js";
/** The courses of a Purple Pen file, with what the file says about itself. */
export type PurplePenCourses = CourseSet & {
    /** The event's title, or "" when the file has none. */
    title: string;
    /** The map file's name as the file gives it, without directories; "" when unknown. */
    mapFileName: string;
};
/** Options for `readPurplePen`. */
export type ReadPurplePenOptions = {
    /** How the XML is parsed; the browser's `DOMParser` when not given. */
    parseXml?: XmlParse;
};
/** Whether XML text looks like a Purple Pen file (checks the root element only). */
export declare function looksLikePurplePen(xml: string): boolean;
/**
 * Reads a Purple Pen (.ppen) file.
 *
 * @param xml - The file's text; see `decodeXmlBytes` for getting it from bytes.
 * @throws {FormatError} `unreadable` for broken XML, `wrong-format` when the root is
 *   not `course-scribe-event`, and `empty` when the file has no courses.
 */
export declare function readPurplePen(xml: string, options?: ReadPurplePenOptions): PurplePenCourses;
