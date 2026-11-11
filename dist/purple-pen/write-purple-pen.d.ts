/**
 * Writes courses as a Purple Pen file (.ppen).
 *
 * The form is the one ControlFreak's own Purple Pen export writes, checked against files
 * Purple Pen 3.5 writes itself: `<event>` with the map and scale, one `<control>` per point
 * in millimetres with y upwards, one `<course>` per course, and the courses' chains of
 * `<course-control>` linked by `next`, the chains after the courses.
 *
 * Special objects, the print area and the print scale, as `readOcadCourses` gives them
 * (`PurplePenLayout`), are written as Purple Pen writes them (`Special` and `PrintArea` in
 * Purple Pen's EventDB.cs): positions in millimetres with y upwards, the control
 * descriptions as the top left corner of their first cell plus a second corner one cell to
 * the right, and the print area's "top" as its largest y.
 *
 * The file only names the map; the user picks it in Purple Pen. A forked course is written
 * as one course per variation, since a fork's chains can only be written safely from a
 * model that has them as branches. What does not fit is reported as `notes`.
 */
import type { CourseSet } from "../courses.js";
import type { OcadCourses } from "../ocad/courses.js";
/**
 * What a course-setting file says beyond the courses, in the form `readOcadCourses` gives
 * it: millimetres on the map with y downwards. Every part is optional.
 */
export type PurplePenLayout = Partial<Pick<OcadCourses, "specials" | "printScale" | "printArea" | "descriptionCellMm" | "courseSymbols" | "descriptions">>;
/** Options for `writePurplePen`. */
export type WritePurplePenOptions = {
    /** The event's title; "" when not known. */
    title?: string;
    /** The map file's name, which Purple Pen looks for first; "" when not known. */
    mapFileName?: string;
    /** The map's scale denominator, e.g. 10000. The set's positions are millimetres at it. */
    scale: number;
    /** The print scale; otherwise the layout's, otherwise one that fits the courses on A4. */
    printScale?: number;
    layout?: PurplePenLayout;
    /** Written as a comment at the top, e.g. the program that wrote the file. */
    creator?: string;
    /** The language Purple Pen shows the descriptions in; "sv" when not given. */
    descriptionLang?: string;
};
/** What did not fit, or what the writer chose, for the app to tell the user. */
export type PurplePenNote = 
/** A forked course written as one course per variation. */
{
    kind: "forked-split";
    course: string;
    variations: number;
}
/** A forked course of which only the first variation was read. */
 | {
    kind: "partly-read";
    course: string;
}
/** Marked routes (snitslade sträckor) are not written. */
 | {
    kind: "taped-routes-left-out";
    course: string;
}
/** Relay teams' variations have no place in Purple Pen. */
 | {
    kind: "team-courses-left-out";
}
/** No print scale was given or in the layout: this one fits the courses on A4. */
 | {
    kind: "print-scale-chosen";
    scale: number;
}
/** No descriptions position in the layout: they are placed right of the courses. */
 | {
    kind: "descriptions-placed";
}
/** Purple Pen has one descriptions block per course; the later ones are left out. */
 | {
    kind: "extra-descriptions-left-out";
};
/**
 * Writes a `CourseSet` as a Purple Pen file. Positions are millimetres on the map at
 * `options.scale` with y downwards, as the readers in this package give them.
 *
 * @returns The file's text, and what did not fit or was chosen.
 */
export declare function writePurplePen(set: CourseSet, options: WritePurplePenOptions): {
    text: string;
    notes: PurplePenNote[];
};
