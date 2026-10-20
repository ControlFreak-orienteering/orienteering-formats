/**
 * Writes courses as an IOF XML 3.0 `CourseData` file, the standard that timing and
 * entry systems (MeOS, OLA, Eventor, OResults) and other course-setting programs read.
 * The counterpart of `readIofCourseData`: a set written here reads back the same.
 *
 * The file is written from a `CourseSet`, the form every course file is read into:
 *
 * - Every point is written once as a `<Control>`, with the set's `id` as the file's
 *   `<Id>`. Timing systems take the id as the punch code, so give the controls their
 *   codes as ids when the file is for one; the codes are also written as
 *   `<PunchingUnitId>`.
 * - `<MapPosition>` is millimetres on the printed map, with y upwards as the map's grid
 *   has it: the set's y-down values are flipped. When the set's map has `scale` and
 *   `metersPerUnit` the set's units are converted to millimetres at that scale and the
 *   scale is written as `<Map>`; otherwise the units are taken to be millimetres already,
 *   as for a set read from an IOF or Purple Pen file.
 * - `<Position>` with latitude and longitude goes before `<MapPosition>`, as the schema
 *   wants, and only for points that have them.
 * - A forked course is written as one `<Course>` per variation, named after the course
 *   and the variation's code, in one `<CourseFamily>`; that is how Purple Pen writes
 *   them and how timing systems read them.
 * - A course's `<Length>` is the set's `lengthMeters` when given (a hand-set length, or
 *   one measured along route choices), otherwise the straight-line sum when the scale
 *   is known. `<LegLength>` is written for courses with a fixed order when the scale is
 *   known. Scores go into `<Score>`; marked routes and crossing points become the
 *   `specialInstruction` of the control the leg leads to.
 * - Class assignments (`classNames`) are written as `<ClassCourseAssignment>`.
 *
 * A course without points is left out; a set with nothing to write is refused.
 */
import type { CourseSet } from "../courses.js";
/** Options for `writeIofCourseData`. */
export type WriteIofOptions = {
    /** The event's name; "" when not known (the element is required by the schema). */
    eventName?: string;
    /** The program writing the file, for the root element's `creator`. */
    creator?: string;
    /** When the file is written (ISO 8601); now when not given. */
    createTime?: string;
    /**
     * The map sheet's corners in the set's units (y downwards), written into `<Map>` so a
     * reader knows what sheet the positions are measured on. Needs the set's map scale.
     */
    mapCorners?: {
        topLeft: {
            x: number;
            y: number;
        };
        bottomRight: {
            x: number;
            y: number;
        };
    };
};
/**
 * Writes an IOF XML 3.0 CourseData file.
 *
 * @param set - The courses, as read from a file or built by the app.
 * @throws {FormatError} `empty` when no course has any point to write.
 */
export declare function writeIofCourseData(set: CourseSet, options?: WriteIofOptions): string;
