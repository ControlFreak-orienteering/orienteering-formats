/**
 * The exchange section: courses, controls and map facts in a small, documented form.
 *
 * A project file also carries the writing app's own course model (`work`). That model
 * is large, belongs to ControlFreak and changes with it, so other apps should not read
 * it. The exchange section is the stable part: ControlFreak writes it next to `work`,
 * and CompetitionFreak reads only this.
 *
 * Rules:
 * - The whole section is optional. Files written before v0.2.0 have none, and reading
 *   them gives `null`.
 * - New fields are only ever added as optional fields.
 * - A reader drops entries it cannot make sense of instead of failing the whole file.
 *
 * Coordinates are in the map file's own units, in the orientation ControlFreak draws
 * the map: x grows to the right (east), y grows downwards (south). With
 * `map.metersPerUnit`, the ground position relative to the map's origin is
 * `east = x * metersPerUnit`, `north = -y * metersPerUnit`.
 */
/** Ground metres per map unit and where the map lies on the earth, if known. */
export type ExchangeMap = {
    /** Map scale denominator, e.g. 10000 for 1:10 000. */
    scale?: number;
    /** Metres on the ground per map unit, at `scale`. */
    metersPerUnit?: number;
    /** Where the map's origin lies in a projected grid. Absent for maps without one. */
    georeference?: ExchangeGeoreference;
};
/**
 * The map's place in a transverse Mercator grid (UTM, SWEREF 99 TM, ETRS-GKn).
 *
 * To get a grid position from a map position: compute metres east/north of the map's
 * origin (see the module comment), rotate them by `grivationDeg` and add `easting` and
 * `northing`. Controls also carry `lat`/`lng` when this is known, so most readers do
 * not need to do this themselves.
 */
export type ExchangeGeoreference = {
    /** Grid easting of the map's origin, in metres. */
    easting: number;
    /** Grid northing of the map's origin, in metres. */
    northing: number;
    /** Angle from grid north to map north, in degrees clockwise. */
    grivationDeg: number;
    /** The grid. */
    projection: ExchangeProjection;
};
/** A transverse Mercator projection. */
export type ExchangeProjection = {
    /** Central meridian, degrees east. */
    centralMeridian: number;
    /** Latitude northings are counted from, in degrees. */
    latitudeOfOrigin: number;
    /** Scale factor on the central meridian. */
    scaleFactor: number;
    /** False easting in metres. */
    falseEasting: number;
    /** False northing in metres. */
    falseNorthing: number;
    /** The ellipsoid: semi-major axis `a` in metres and flattening `f`. */
    ellipsoid: {
        a: number;
        f: number;
    };
};
/**
 * What kind of point a control is.
 *
 * - `start`: start triangle.
 * - `control`: an ordinary control, punched.
 * - `crossing`: a mandatory crossing point. Runners must pass it; it is not punched.
 * - `finish`: finish.
 */
export type ExchangeControlKind = "start" | "control" | "crossing" | "finish";
/** A point on the map that courses refer to. Each point is listed once. */
export type ExchangeControl = {
    /** Identifies the point within this file. Courses refer to it. Not a punch code. */
    id: string;
    /** What kind of point it is. */
    kind: ExchangeControlKind;
    /** Punch codes. Usually one; empty for start, finish and crossing points. */
    codes: number[];
    /** The label printed on the map for points without a code, e.g. "S1" or "M1". */
    label?: string;
    /** Position in map units, x to the right. */
    x: number;
    /** Position in map units, y downwards. */
    y: number;
    /** WGS84 latitude, when the map is georeferenced. */
    lat?: number;
    /** WGS84 longitude, when the map is georeferenced. */
    lng?: number;
};
/**
 * In which order a course's controls are visited.
 *
 * - `fixed`: in the listed order.
 * - `free`: in any order (score courses).
 */
export type ExchangeCourseOrder = "fixed" | "free";
/** A course. */
export type ExchangeCourse = {
    /** Identifies the course within this file, and stays the same between saves. */
    id: string;
    /** The course name. */
    name: string;
    /** Whether the controls are visited in order. */
    order: ExchangeCourseOrder;
    /**
     * Control ids from start to finish. For a forked course this is the first variation;
     * all variations are in `variations`.
     */
    controls: string[];
    /** Course length in metres. */
    lengthMeters?: number;
    /** Climb in metres. */
    climbMeters?: number;
    /** Print scale denominator for this course, e.g. 7500. */
    printScale?: number;
    /** Points per control id, for score courses. */
    scores?: Record<string, number>;
    /** Forking variations. Absent when the course is not forked. */
    variations?: ExchangeVariation[];
};
/** One forking variation of a course. */
export type ExchangeVariation = {
    /** The variation's code, e.g. "AC". Unique within the course. */
    code: string;
    /** Control ids from start to finish. */
    controls: string[];
    /** Length of this variation in metres. */
    lengthMeters?: number;
};
/** The exchange section of a project file or pack. */
export type CourseExchange = {
    /** Map facts. Absent if the writer did not have the map at hand. */
    map?: ExchangeMap;
    /** Every point any course uses. */
    controls: ExchangeControl[];
    /** The courses. */
    courses: ExchangeCourse[];
};
/**
 * Reads the exchange section from untrusted input.
 *
 * Returns `null` when there is no section (files from before v0.2.0) or it is not an
 * object. Otherwise every entry is checked field by field: entries that cannot be used
 * are dropped, unknown fields are ignored, and course references to controls that are
 * not in the file are removed.
 *
 * @param value - The `exchange` field as parsed from JSON.
 */
export declare function parseCourseExchange(value: unknown): CourseExchange | null;
