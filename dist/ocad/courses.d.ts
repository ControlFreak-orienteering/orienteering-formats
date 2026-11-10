/**
 * Reads courses from OCAD course-setting files (.ocd).
 *
 * OCAD keeps its courses in a file of their own, made with "Course Setting" mode, and
 * shows the map as a background map. Such a file is an ordinary .ocd: the controls are
 * objects drawn with the course-setting symbols, and the course setting itself is in
 * parameter strings. The parts read here:
 *
 * - Controls. OCAD 10 and 11 write one parameter string of record type 1 per control,
 *   `31\tYc\td2.001`: the code, then `Y` with the kind (`s` start, `c` control, `f`
 *   finish; others, such as `d` for a description box, are skipped). The string names
 *   the object that marks the control on the map. OCAD 12 and later write the same
 *   string as the object's own object string, with the code also in an `a` part:
 *   `1031\tYc\ta31`.
 * - Courses, record type 2: `H21\tsS1\tc31\tc32\tfM1`, the name and then the course's
 *   points in order, each part a letter (`s` start, `c` control, `f` finish) and a
 *   control's code. Other parts are skipped. A course that ends at a start, as training
 *   loops do, gets a finish at that start.
 * - Background maps, record type 8: their file names, the first being the map the
 *   courses were set on.
 * - Scale and georeference, record type 1039, as for a map (see
 *   `orienteering-formats/map`).
 *
 * Positions come out as millimetres on the map with y downwards, as from Purple Pen, and
 * the file's georeference, when it has one OCAD can name, is in `map`, so an app can
 * place the controls on the earth without the background map.
 *
 * OCAD 8 and 9 kept their courses in another way, and are refused as `empty`. Forked
 * and relay courses, which OCAD writes as other record types, are not read; nor are the
 * climb and length OCAD can store, so lengths are along straight legs.
 *
 * The format was learnt from OCAD's file format documentation and course files made by
 * OCAD 11 and 12; no OCAD code is used.
 */
import type { CourseSet } from "../courses.js";
/**
 * What a course-setting object other than a control is, by OCAD's course-setting
 * symbol numbers (the same in OCAD's ISOM 2000 and 2017 sets):
 *
 * - `boundary` 707, a line not to be crossed;
 * - `crossing` 708, a crossing point (a point, turned by `angle`);
 * - `out-of-bounds` 709 and `dangerous` 710, areas;
 * - `forbidden-route` 711, `first-aid` 712, `water` 713 and `registration-mark` 750,
 *   points;
 * - `white-out` 760, the white area behind the control descriptions;
 * - `descriptions` 720, the control descriptions' top left corner;
 * - `text`: a text object; `field` says when it stands for the course's name (721) or
 *   the event's name (723) rather than for its own `text`.
 */
export type OcadSpecialKind = "boundary" | "crossing" | "out-of-bounds" | "dangerous" | "forbidden-route" | "first-aid" | "water" | "registration-mark" | "white-out" | "descriptions" | "text";
/** A course-setting object that is not a control: see `OcadSpecialKind`. */
export type OcadSpecial = {
    kind: OcadSpecialKind;
    /**
     * Millimetres on the map, y downwards: one point for points, the corners for lines and
     * areas (curves are straightened), and for text the anchor and then its box.
     */
    points: {
        x: number;
        y: number;
    }[];
    /** Degrees, counter-clockwise, for a turned point. */
    angle?: number;
    /** A text object's text. */
    text?: string;
    /** A text object that OCAD fills in itself. */
    field?: "course-name" | "event-name";
    /** The ids of the courses it is on; absent when it is on all of them. */
    courses?: string[];
};
/** The courses of an OCAD course-setting file, with what the file says about itself. */
export type OcadCourses = CourseSet & {
    /**
     * The background maps' file names, without directories, in the file's order; the
     * first is usually the map the courses were set on. Empty when the file names none.
     */
    backgroundMaps: string[];
    /** The course-setting objects that are not controls. */
    specials: OcadSpecial[];
    /** The scale the courses are printed at, when the file says. */
    printScale?: number;
    /** The print window, in millimetres on the map with y downwards, when the file has one. */
    printArea?: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    };
    /** The side of a control description cell, in millimetres on the map. */
    descriptionCellMm?: number;
    /**
     * How big the file draws the course: the control circle's diameter and the course
     * line's width (symbols 702 and 704), in millimetres on the map. OCAD's course symbols
     * are measured on the map like everything else, so they grow with it when the course is
     * printed at a larger scale.
     */
    courseSymbols?: {
        controlDiameterMm?: number;
        lineWidthMm?: number;
    };
    /**
     * The control descriptions, by point id: per column (C to H) the IOF 2004 symbol,
     * written as Purple Pen writes it, e.g. `{ D: "1.9", G: "11.1N" }`. Only points with a
     * description are listed. See `iofDescriptionRef` for how OCAD's codes are read.
     */
    descriptions?: Record<string, OcadDescription>;
};
/** One control's description: the IOF 2004 symbol per column, see `OcadCourses.descriptions`. */
export type OcadDescription = Partial<Record<"C" | "D" | "E" | "F" | "G" | "H", string>>;
/**
 * An OCAD description code as an IOF 2004 symbol reference, or null for a code that is
 * not one. OCAD writes the symbol as a group and a three-digit number, the numbers of
 * its own description symbols: below 100 the number is the symbol in the group
 * (`1.009` is 1.9, hill; `11.011` is 11.11, top). From 100 the last digit is a
 * direction, 1 to 8 for N, W, S, E, NW, SW, SE and NE, and the digits before it the
 * symbol, without a trailing zero (`11.101` is 11.1N, north side; `11.141` is 11.14N,
 * north foot; `0.205` is 0.2NW).
 */
export declare function iofDescriptionRef(code: string): string | null;
/** Whether the bytes look like an OCAD file (checks the magic number only). */
export declare function looksLikeOcad(bytes: Uint8Array): boolean;
/**
 * Reads an OCAD course-setting file.
 *
 * @param bytes - The .ocd file.
 * @throws {FormatError} `wrong-format` when the bytes are not an OCAD file,
 *   `unreadable` when it is damaged, and `empty` when it has no courses (an ordinary
 *   map, or a course file from OCAD 8 or 9).
 */
export declare function readOcadCourses(bytes: Uint8Array | ArrayBuffer): OcadCourses;
