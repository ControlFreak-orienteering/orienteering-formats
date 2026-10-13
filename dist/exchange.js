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
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v) => typeof v === "number" && Number.isFinite(v) ? v : undefined;
const nonNegative = (v) => {
    const n = finite(v);
    return n !== undefined && n >= 0 ? n : undefined;
};
const positive = (v) => {
    const n = finite(v);
    return n !== undefined && n > 0 ? n : undefined;
};
const text = (v) => typeof v === "string" && v !== "" ? v : undefined;
const KINDS = ["start", "control", "crossing", "finish"];
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
export function parseCourseExchange(value) {
    if (!isObj(value))
        return null;
    const controls = [];
    const ids = new Set();
    for (const raw of Array.isArray(value["controls"]) ? value["controls"] : []) {
        const control = parseControl(raw);
        if (!control || ids.has(control.id))
            continue;
        ids.add(control.id);
        controls.push(control);
    }
    const courses = [];
    for (const raw of Array.isArray(value["courses"]) ? value["courses"] : []) {
        const course = parseCourse(raw, ids);
        if (course)
            courses.push(course);
    }
    const map = parseMap(value["map"]);
    return { ...(map ? { map } : {}), controls, courses };
}
function parseControl(raw) {
    if (!isObj(raw))
        return null;
    const id = text(raw["id"]);
    const kind = KINDS.find((k) => k === raw["kind"]);
    const x = finite(raw["x"]);
    const y = finite(raw["y"]);
    if (!id || !kind || x === undefined || y === undefined)
        return null;
    const codes = Array.isArray(raw["codes"])
        ? raw["codes"].filter((c) => Number.isInteger(c) && c >= 0)
        : [];
    const label = text(raw["label"]);
    const lat = finite(raw["lat"]);
    const lng = finite(raw["lng"]);
    return {
        id,
        kind,
        codes,
        ...(label ? { label } : {}),
        x,
        y,
        ...(lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
            ? { lat, lng }
            : {}),
    };
}
const idList = (v, known) => Array.isArray(v) ? v.filter((id) => typeof id === "string" && known.has(id)) : [];
function parseCourse(raw, known) {
    if (!isObj(raw))
        return null;
    const id = text(raw["id"]);
    if (!id)
        return null;
    const name = typeof raw["name"] === "string" ? raw["name"] : "";
    const order = raw["order"] === "free" ? "free" : "fixed";
    const lengthMeters = nonNegative(raw["lengthMeters"]);
    const climbMeters = nonNegative(raw["climbMeters"]);
    const printScale = positive(raw["printScale"]);
    let scores;
    if (isObj(raw["scores"])) {
        for (const [controlId, points] of Object.entries(raw["scores"])) {
            const p = finite(points);
            if (p === undefined || !known.has(controlId))
                continue;
            (scores ??= {})[controlId] = p;
        }
    }
    let variations;
    if (Array.isArray(raw["variations"])) {
        const codes = new Set();
        for (const v of raw["variations"]) {
            if (!isObj(v))
                continue;
            const code = text(v["code"]);
            if (!code || codes.has(code))
                continue;
            codes.add(code);
            const length = nonNegative(v["lengthMeters"]);
            (variations ??= []).push({
                code,
                controls: idList(v["controls"], known),
                ...(length !== undefined ? { lengthMeters: length } : {}),
            });
        }
    }
    return {
        id,
        name,
        order,
        controls: idList(raw["controls"], known),
        ...(lengthMeters !== undefined ? { lengthMeters } : {}),
        ...(climbMeters !== undefined ? { climbMeters } : {}),
        ...(printScale !== undefined ? { printScale } : {}),
        ...(scores ? { scores } : {}),
        ...(variations ? { variations } : {}),
    };
}
function parseMap(raw) {
    if (!isObj(raw))
        return null;
    const scale = positive(raw["scale"]);
    const metersPerUnit = positive(raw["metersPerUnit"]);
    const georeference = parseGeoreference(raw["georeference"]);
    const map = {
        ...(scale !== undefined ? { scale } : {}),
        ...(metersPerUnit !== undefined ? { metersPerUnit } : {}),
        ...(georeference ? { georeference } : {}),
    };
    return Object.keys(map).length > 0 ? map : null;
}
function parseGeoreference(raw) {
    if (!isObj(raw) || !isObj(raw["projection"]))
        return null;
    const p = raw["projection"];
    const e = isObj(p["ellipsoid"]) ? p["ellipsoid"] : {};
    const values = {
        easting: finite(raw["easting"]),
        northing: finite(raw["northing"]),
        grivationDeg: finite(raw["grivationDeg"]),
        centralMeridian: finite(p["centralMeridian"]),
        latitudeOfOrigin: finite(p["latitudeOfOrigin"]),
        scaleFactor: positive(p["scaleFactor"]),
        falseEasting: finite(p["falseEasting"]),
        falseNorthing: finite(p["falseNorthing"]),
        a: positive(e["a"]),
        f: nonNegative(e["f"]),
    };
    if (Object.values(values).some((v) => v === undefined))
        return null;
    const v = values;
    return {
        easting: v.easting,
        northing: v.northing,
        grivationDeg: v.grivationDeg,
        projection: {
            centralMeridian: v.centralMeridian,
            latitudeOfOrigin: v.latitudeOfOrigin,
            scaleFactor: v.scaleFactor,
            falseEasting: v.falseEasting,
            falseNorthing: v.falseNorthing,
            ellipsoid: { a: v.a, f: v.f },
        },
    };
}
