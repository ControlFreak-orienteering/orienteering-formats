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
import { FormatError } from "../errors.js";
/** The exchange kinds as IOF 3.0 control types. */
const TYPE = {
    start: "Start",
    control: "Control",
    crossing: "CrossingPoint",
    finish: "Finish",
};
/** Escapes text for XML content and attribute values. */
function escapeXml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
/** The courses to write: one per variation for a forked course, otherwise the course. */
function expand(course) {
    const variations = course.variations ?? [];
    if (variations.length === 0)
        return [course];
    return variations.map((variation) => ({
        ...course,
        name: `${course.name} ${variation.code}`,
        family: course.name,
        controls: variation.controls,
        ...(variation.lengthMeters !== undefined
            ? { lengthMeters: variation.lengthMeters }
            : { lengthMeters: undefined }),
        // Marked routes are on the main course's legs; a variation has its own order.
        tapedRoutes: undefined,
    }));
}
/**
 * Writes an IOF XML 3.0 CourseData file.
 *
 * @param set - The courses, as read from a file or built by the app.
 * @throws {FormatError} `empty` when no course has any point to write.
 */
export function writeIofCourseData(set, options = {}) {
    const { eventName = "", creator = "orienteering-formats", mapCorners } = options;
    const createTime = options.createTime ?? new Date().toISOString();
    const scale = set.map?.scale !== undefined && set.map.scale > 0 ? set.map.scale : undefined;
    const metersPerUnit = set.map?.metersPerUnit !== undefined && set.map.metersPerUnit > 0
        ? set.map.metersPerUnit
        : undefined;
    // Set units to millimetres on the sheet; 1 when the set is in millimetres already.
    const unitsToMm = scale !== undefined && metersPerUnit !== undefined ? (metersPerUnit * 1000) / scale : 1;
    const mm = (p) => ({ x: p.x * unitsToMm, y: -p.y * unitsToMm });
    /** Metres on the ground between two points, when the scale says how long a millimetre is. */
    const metres = (a, b) => {
        if (scale === undefined)
            return undefined;
        const pa = mm(a);
        const pb = mm(b);
        return (Math.hypot(pb.x - pa.x, pb.y - pa.y) / 1000) * scale;
    };
    const byId = new Map(set.controls.map((c) => [c.id, c]));
    const courses = set.courses
        .flatMap(expand)
        .map((course) => ({
        ...course,
        points: course.controls.flatMap((id) => {
            const control = byId.get(id);
            return control ? [control] : [];
        }),
    }))
        .filter((course) => course.points.length > 0);
    if (courses.length === 0)
        throw new FormatError("empty");
    const lines = [];
    const pad = (indent) => "  ".repeat(indent);
    const text = (indent, name, value) => {
        if (value === undefined)
            return;
        lines.push(`${pad(indent)}<${name}>${escapeXml(String(value))}</${name}>`);
    };
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(`<CourseData xmlns="http://www.orienteering.org/datastandard/3.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" iofVersion="3.0" createTime="${escapeXml(createTime)}" creator="${escapeXml(creator)}">`);
    lines.push(`${pad(1)}<Event>`);
    text(2, "Name", eventName);
    lines.push(`${pad(1)}</Event>`);
    lines.push(`${pad(1)}<RaceCourseData>`);
    if (scale !== undefined) {
        // `<Map>` comes first in RaceCourseData, and its facts belong together: the scale
        // the positions are measured in, and the sheet's corners in the same millimetres.
        lines.push(`${pad(2)}<Map>`);
        text(3, "Scale", Math.round(scale));
        if (mapCorners) {
            const topLeft = mm(mapCorners.topLeft);
            const bottomRight = mm(mapCorners.bottomRight);
            lines.push(`${pad(3)}<MapPositionTopLeft unit="mm" x="${topLeft.x.toFixed(2)}" y="${topLeft.y.toFixed(2)}"/>`);
            lines.push(`${pad(3)}<MapPositionBottomRight unit="mm" x="${bottomRight.x.toFixed(2)}" y="${bottomRight.y.toFixed(2)}"/>`);
        }
        lines.push(`${pad(2)}</Map>`);
    }
    // Every point once, in the order the courses use them, as the file is read.
    const written = new Set();
    for (const course of courses) {
        for (const control of course.points) {
            if (written.has(control.id))
                continue;
            written.add(control.id);
            const position = mm(control);
            lines.push(`${pad(2)}<Control${control.kind !== "control" ? ` type="${TYPE[control.kind]}"` : ""}>`);
            text(3, "Id", control.id);
            for (const code of control.codes)
                text(3, "PunchingUnitId", code);
            // Seven decimals is about a centimetre on the ground: enough, and not more than
            // the conversion from a map grid can promise.
            if (control.lat !== undefined && control.lng !== undefined) {
                lines.push(`${pad(3)}<Position lng="${control.lng.toFixed(7)}" lat="${control.lat.toFixed(7)}"/>`);
            }
            lines.push(`${pad(3)}<MapPosition unit="mm" x="${position.x.toFixed(2)}" y="${position.y.toFixed(2)}"/>`);
            lines.push(`${pad(2)}</Control>`);
        }
    }
    for (const course of courses) {
        const fixed = course.order === "fixed";
        const instructionAt = new Map();
        for (const route of course.tapedRoutes ?? []) {
            instructionAt.set(route.to, route.kind === "all" ? "TapedRoute" : "FunnelTapedRoute");
        }
        lines.push(`${pad(2)}<Course>`);
        text(3, "Name", course.name);
        text(3, "CourseFamily", course.family);
        let length = course.lengthMeters;
        if (length === undefined && fixed && course.points.length >= 2 && scale !== undefined) {
            length = 0;
            for (let i = 1; i < course.points.length; i++) {
                length += metres(course.points[i - 1], course.points[i]) ?? 0;
            }
        }
        text(3, "Length", length === undefined ? undefined : Math.round(length));
        text(3, "Climb", course.climbMeters === undefined ? undefined : Math.round(course.climbMeters));
        text(3, "NumberOfControls", course.points.filter((p) => p.kind === "control").length);
        course.points.forEach((control, i) => {
            // A crossing point has its own instruction: it is passed, not punched, and the
            // leg to it cannot also be marked.
            const instruction = control.kind === "crossing" ? "MandatoryCrossingPoint" : instructionAt.get(i);
            lines.push(`${pad(3)}<CourseControl type="${TYPE[control.kind]}"${instruction ? ` specialInstruction="${instruction}"` : ""}>`);
            text(4, "Control", control.id);
            text(4, "Score", course.scores?.[control.id]);
            if (i > 0 && fixed) {
                const leg = metres(course.points[i - 1], control);
                text(4, "LegLength", leg === undefined ? undefined : Math.round(leg));
            }
            lines.push(`${pad(3)}</CourseControl>`);
        });
        lines.push(`${pad(2)}</Course>`);
    }
    for (const course of courses) {
        for (const className of course.classNames ?? []) {
            lines.push(`${pad(2)}<ClassCourseAssignment>`);
            text(3, "ClassName", className);
            text(3, "CourseName", course.name);
            lines.push(`${pad(2)}</ClassCourseAssignment>`);
        }
    }
    lines.push(`${pad(1)}</RaceCourseData>`);
    lines.push("</CourseData>");
    return lines.join("\n");
}
