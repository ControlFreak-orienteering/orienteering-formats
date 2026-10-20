/**
 * Reads courses from IOF XML `CourseData` files.
 *
 * IOF XML is the International Orienteering Federation's standard for exchanging data
 * between orienteering programs. Course-setting programs (OCAD, Condes, Purple Pen,
 * ControlFreak) export courses as a CourseData file. Two versions are in use:
 *
 * - **3.0** (current): root `<CourseData iofVersion="3.0">` with `<RaceCourseData>`
 *   holding `<Control>` points, `<Course>` elements with `<CourseControl>` references,
 *   and `<ClassCourseAssignment>`. A forked course is written as one `<Course>` per
 *   variation, sharing a `<CourseFamily>`. Score courses carry `<Score>` on their
 *   controls, or `randomOrder="true"`.
 *   Schema: https://github.com/international-orienteering-federation/datastandard-v3
 * - **2.0.3** (older, still exported by many programs): `<StartPoint>`, `<Control>` and
 *   `<FinishPoint>` with codes, and `<Course>` elements holding one or more
 *   `<CourseVariation>` (forking) with numbered `<CourseControl>`s. It has no positions
 *   on the earth.
 *
 * Only what the apps use is read. Unknown elements are ignored.
 *
 * Positions: `<MapPosition>` is millimetres on the printed map, counted with y upwards
 * as the map's own grid does (so OCAD, Purple Pen and ControlFreak write it), and flipped
 * here to the exchange section's y-down rule in both versions. `<Position>` (3.0 only)
 * gives `lat`/`lng`, which a program writes only when its map is georeferenced. A point
 * without a `<MapPosition>` is kept at (0, 0) and listed in `unpositioned`, so the
 * courses keep their order and an app can say what is missing.
 */
import type { CourseSet } from "../courses.js";
import { type XmlParse } from "../xml.js";
/** Which IOF XML version a CourseData file uses. */
export type IofVersion = "3.0" | "2.0.3";
/** The courses of a CourseData file, with what the file says about itself. */
export type IofCourseData = CourseSet & {
    /** Which version the file was written in. */
    version: IofVersion;
    /** The event's name, or "" when the file has none. */
    eventName: string;
    /**
     * Ids of the points the file gives no position on the map for (they are at (0, 0) in
     * `controls`). A file from a results system often has codes but no positions.
     */
    unpositioned: string[];
};
/** Options for `readIofCourseData`. */
export type ReadIofOptions = {
    /** How the XML is parsed; the browser's `DOMParser` when not given. */
    parseXml?: XmlParse;
};
/** Whether XML text looks like an IOF CourseData file (checks the root element only). */
export declare function looksLikeIofCourseData(xml: string): boolean;
/**
 * Reads an IOF XML CourseData file, version 3.0 or 2.0.3.
 *
 * @param xml - The file's text; see `decodeXmlBytes` for getting it from bytes.
 * @throws {FormatError} `unreadable` for broken XML, `wrong-format` when the root is
 *   not `CourseData`, and `empty` when the file has no courses.
 */
export declare function readIofCourseData(xml: string, options?: ReadIofOptions): IofCourseData;
