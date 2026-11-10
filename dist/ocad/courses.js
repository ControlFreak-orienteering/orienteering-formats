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
import { FormatError } from "../errors.js";
import { BinaryReader } from "../map/ocad/binary-reader.js";
import { readOcadPoints } from "../map/ocad/coords.js";
import { readFileHeader } from "../map/ocad/file-header.js";
import { readSymbol, readSymbolIndex } from "../map/ocad/symbols.js";
import { readGeoReference } from "../map/ocad/georef.js";
import { parseParameterString, readParameterStrings, } from "../map/ocad/parameter-strings.js";
import { ocadGeoreference } from "../map/read-map.js";
/** OCAD's course-setting symbols as special kinds, by symbol number over 1000. */
const SPECIAL_SYMBOLS = {
    707: "boundary",
    708: "crossing",
    709: "out-of-bounds",
    710: "dangerous",
    711: "forbidden-route",
    712: "first-aid",
    713: "water",
    720: "descriptions",
    750: "registration-mark",
    760: "white-out",
};
/** Which object types each kind needs: point, line or area. */
const POINT_KINDS = new Set([
    "crossing",
    "forbidden-route",
    "first-aid",
    "water",
    "registration-mark",
    "descriptions",
]);
const AREA_KINDS = new Set(["out-of-bounds", "dangerous", "white-out"]);
const COURSE_NAME_SYMBOL = 721;
const EVENT_NAME_SYMBOL = 723;
/** Symbols of the texts OCAD draws itself for each course: numbers and codes. */
const GENERATED_TEXT_SYMBOL = 703;
const PRINT_RECORD_TYPE = 1026;
const COURSE_SETTING_RECORD_TYPE = 1031;
const CONTROL_RECORD_TYPE = 1;
const COURSE_RECORD_TYPE = 2;
const BACKGROUND_MAP_RECORD_TYPE = 8;
/** OCAD 12 moved the object header around and gave objects their own strings. */
const OBJECT_STRINGS_FROM = 12;
const KINDS = {
    s: "start",
    c: "control",
    f: "finish",
};
/** Whether the bytes look like an OCAD file (checks the magic number only). */
export function looksLikeOcad(bytes) {
    return bytes.length >= 2 && bytes[0] === 0xad && bytes[1] === 0x0c;
}
/** The control in a control string, or null for strings of other kinds. */
function controlOf(s, objectIndex) {
    const kind = KINDS[s.fields.get("Y") ?? ""];
    // OCAD 12 puts something before the code in the subject; the `a` part is the code.
    const code = (s.fields.get("a") ?? s.subject).trim();
    if (!kind || !code)
        return null;
    return { code, kind, objectIndex };
}
/**
 * Reads an OCAD course-setting file.
 *
 * @param bytes - The .ocd file.
 * @throws {FormatError} `wrong-format` when the bytes are not an OCAD file,
 *   `unreadable` when it is damaged, and `empty` when it has no courses (an ordinary
 *   map, or a course file from OCAD 8 or 9).
 */
export function readOcadCourses(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (!looksLikeOcad(view))
        throw new FormatError("wrong-format");
    const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    const reader = new BinaryReader(buffer);
    let version;
    let strings;
    let objects;
    let courseSymbols;
    try {
        const header = readFileHeader(reader);
        version = header.version;
        strings = readParameterStrings(reader, header.stringIndexBlockPos);
        objects = readObjectEntries(reader, header.objectIndexBlockPos, version);
        courseSymbols = version >= 10 ? readCourseSymbols(reader, header.symbolIndexBlockPos, version) : undefined;
    }
    catch {
        throw new FormatError("unreadable");
    }
    if (version < 10)
        throw new FormatError("empty");
    const controlStrings = [];
    for (const s of strings.get(CONTROL_RECORD_TYPE) ?? []) {
        const control = controlOf(s, s.objectIndex);
        if (control)
            controlStrings.push(control);
    }
    if (version >= OBJECT_STRINGS_FROM) {
        for (const [index, entry] of objects) {
            if (!entry.objectString)
                continue;
            const control = controlOf(parseParameterString(0, entry.objectString), index);
            if (control)
                controlStrings.push(control);
        }
    }
    // One point per code, placed where its object is; the first string for a code wins.
    const byCode = new Map();
    for (const c of controlStrings) {
        if (byCode.has(c.code))
            continue;
        const at = objects.get(c.objectIndex)?.at;
        if (!at)
            continue;
        const number = /^\d+$/.test(c.code) ? Number(c.code) : undefined;
        byCode.set(c.code, {
            id: c.code,
            kind: c.kind,
            codes: c.kind === "control" && number !== undefined && number > 0 ? [number] : [],
            ...(c.kind !== "control" ? { label: c.code } : {}),
            // 1/100 mm with y upwards; the exchange rule is millimetres with y downwards.
            x: at.x / 100,
            y: -at.y / 100,
        });
    }
    const georef = readGeoReference(strings);
    const scale = georef && georef.mapScale > 0 ? georef.mapScale : undefined;
    const georeference = ocadGeoreference(georef);
    const extra = new Map();
    const courses = [];
    for (const s of strings.get(COURSE_RECORD_TYPE) ?? []) {
        const name = s.subject.trim();
        const sequence = [];
        let ended = false;
        for (const part of s.parts) {
            const kind = KINDS[part.charAt(0)];
            const point = byCode.get(part.slice(1).trim());
            if (!kind || !point || point.kind !== kind || ended)
                continue;
            if (kind === "start" && sequence.length > 0) {
                // Back at a start: the course ends there.
                const id = `finish:${point.id}`;
                if (!extra.has(id))
                    extra.set(id, { ...point, id, kind: "finish" });
                sequence.push(id);
                ended = true;
                continue;
            }
            sequence.push(point.id);
            if (kind === "finish")
                ended = true;
        }
        if (sequence.length === 0)
            continue;
        const positions = (id) => byCode.get(id) ?? extra.get(id);
        const lengthMeters = scale ? straightLength(sequence.map(positions), scale) : undefined;
        // Ids must differ; OCAD lets two courses share a name.
        let id = name || `course${courses.length + 1}`;
        while (courses.some((c) => c.id === id))
            id = `${id}*`;
        courses.push({
            id,
            name,
            order: "fixed",
            controls: sequence,
            ...(lengthMeters !== undefined ? { lengthMeters } : {}),
        });
    }
    if (courses.length === 0)
        throw new FormatError("empty");
    const used = new Set(courses.flatMap((c) => c.controls));
    const controls = [...byCode.values(), ...extra.values()].filter((c) => used.has(c.id));
    const backgroundMaps = (strings.get(BACKGROUND_MAP_RECORD_TYPE) ?? [])
        .map((s) => s.subject.split(/[\\/]/).pop()?.trim() ?? "")
        .filter((n) => n !== "");
    const courseIds = new Map(courses.map((c) => [c.name, c.id]));
    const specials = readSpecials(objects, strings, courseIds);
    const print = strings.get(PRINT_RECORD_TYPE)?.[0];
    const num = (s, key) => {
        const v = Number(s?.fields.get(key));
        return s?.fields.has(key) && Number.isFinite(v) ? v : undefined;
    };
    const printScale = num(print, "a");
    const [left, bottom, right, top] = ["L", "B", "R", "T"].map((k) => num(print, k));
    const printArea = left !== undefined && bottom !== undefined && right !== undefined && top !== undefined && right > left && top > bottom
        ? { left, top: -top, right, bottom: -bottom }
        : undefined;
    const cell = num(strings.get(COURSE_SETTING_RECORD_TYPE)?.[0], "s");
    return {
        ...(printScale !== undefined && printScale > 0 ? { printScale } : {}),
        ...(printArea ? { printArea } : {}),
        ...(cell !== undefined && cell > 0 ? { descriptionCellMm: cell } : {}),
        ...(courseSymbols ? { courseSymbols } : {}),
        specials,
        ...(scale
            ? {
                map: {
                    scale,
                    metersPerUnit: scale / 1000,
                    ...(georeference ? { georeference } : {}),
                },
            }
            : {}),
        controls,
        courses,
        backgroundMaps,
    };
}
/**
 * The course-setting objects that are not controls. Objects OCAD draws itself for each
 * course (numbers, lines, codes) are hidden and left out; so are objects whose symbol
 * is not a course-setting symbol this reader knows, or of the wrong type.
 */
function readSpecials(objects, strings, courseIds) {
    // OCAD 10 and 11 tie an object to a course with a string naming the object.
    const owner = new Map();
    for (const list of strings.values()) {
        for (const s of list)
            if (s.objectIndex > 0)
                owner.set(s.objectIndex, s.subject.trim());
    }
    const mm = (p) => ({ x: p.x / 100, y: -p.y / 100 });
    const specials = [];
    for (const [index, o] of objects) {
        if (o.status !== OBJECT_STATUS_NORMAL || o.points.length === 0)
            continue;
        const symbol = Math.trunc(o.sym / 1000);
        const isText = o.otp === 4 || o.otp === 5;
        let special = null;
        if (isText) {
            if (symbol < 700 || symbol >= 800 || symbol === GENERATED_TEXT_SYMBOL)
                continue;
            const field = symbol === COURSE_NAME_SYMBOL ? "course-name" : symbol === EVENT_NAME_SYMBOL ? "event-name" : undefined;
            if (!field && !o.text.trim())
                continue;
            special = {
                kind: "text",
                points: o.points.map(mm),
                ...(field ? { field } : { text: o.text }),
            };
        }
        else {
            const kind = SPECIAL_SYMBOLS[symbol];
            if (!kind)
                continue;
            const wanted = POINT_KINDS.has(kind) ? 1 : AREA_KINDS.has(kind) ? 3 : 2;
            if (wanted === 1 ? o.otp !== 1 : o.otp !== wanted)
                continue;
            special = {
                kind,
                points: wanted === 1 ? [mm(o.points[0])] : o.points.map(mm),
                ...(kind === "crossing" && o.angle ? { angle: o.angle } : {}),
            };
        }
        const subject = o.objectString
            ? parseParameterString(0, o.objectString).subject.trim()
            : (owner.get(index) ?? "");
        const course = courseIds.get(subject);
        if (course !== undefined)
            special.courses = [course];
        specials.push(special);
    }
    return specials;
}
/** The control circle's and course line's sizes, from symbols 702 and 704. */
function readCourseSymbols(reader, firstBlockPos, version) {
    const sizes = {};
    for (const entry of readSymbolIndex(reader, firstBlockPos)) {
        // The symbol number is the record's second integer; read only the two wanted.
        reader.push(entry.filePos + 4);
        const symNum = reader.integer();
        reader.pop();
        if (symNum !== 702000 && symNum !== 704000)
            continue;
        let symbol;
        try {
            symbol = readSymbol(reader, version, entry.filePos);
        }
        catch {
            continue;
        }
        if (symbol?.kind === "point") {
            const circle = symbol.elements.find((e) => e.type === "circle" && e.diameter > 0);
            if (circle)
                sizes.controlDiameterMm = circle.diameter / 100;
        }
        else if (symbol?.kind === "line" && symbol.lineWidth > 0) {
            sizes.lineWidthMm = symbol.lineWidth / 100;
        }
    }
    return Object.keys(sizes).length > 0 ? sizes : undefined;
}
const OBJECT_BLOCK_BYTES = 4 + 256 * 40;
const OBJECT_STATUS_NORMAL = 1;
const OBJECT_STATUS_HIDDEN = 2;
/**
 * Every object in the file by its number in the object index, from 1. Only what the
 * course setting needs is read; the map reader (`parseOcadFile`) reads the rest.
 */
function readObjectEntries(reader, firstBlockPos, version) {
    const entries = new Map();
    const visited = new Set();
    let blockPos = firstBlockPos;
    let number = 0;
    while (blockPos > 0 &&
        blockPos <= reader.length - OBJECT_BLOCK_BYTES &&
        !visited.has(blockPos)) {
        visited.add(blockPos);
        reader.push(blockPos);
        const next = reader.integer();
        const slots = [];
        for (let i = 0; i < 256; i++) {
            number++;
            reader.skip(16); // bounding rectangle
            const pos = reader.integer();
            const size = reader.integer();
            reader.skip(6); // symbol, object type, encrypted mode
            const status = reader.byte();
            reader.skip(9);
            if (pos > 0 &&
                pos < reader.length &&
                (status === OBJECT_STATUS_NORMAL || status === OBJECT_STATUS_HIDDEN)) {
                slots.push({ number, pos, size, status });
            }
        }
        reader.pop();
        for (const slot of slots) {
            try {
                entries.set(slot.number, readObjectEntry(reader, version, slot.pos, slot.size, slot.status));
            }
            catch {
                // One damaged object must not take the courses down with it.
            }
        }
        blockPos = next;
    }
    return entries;
}
/** Reads one object. */
function readObjectEntry(reader, version, pos, size, status) {
    reader.push(pos);
    try {
        const sym = reader.integer();
        const otp = reader.byte();
        reader.byte();
        const angle = reader.smallInt() / 10;
        let nItem;
        let nText;
        let nObjectString = 0;
        let headerBytes;
        if (version < OBJECT_STRINGS_FROM) {
            nItem = reader.cardinal();
            nText = reader.word();
            reader.skip(26);
            headerBytes = 40;
        }
        else {
            reader.skip(36); // colour to modification date
            nItem = reader.cardinal();
            nText = reader.word();
            nObjectString = reader.word();
            reader.skip(4); // database string length, object string type, reserved
            headerBytes = 56;
        }
        if ((nItem + nText) * 8 > reader.remaining)
            throw new Error("object beyond end of file");
        const raw = readOcadPoints(reader, nItem);
        const points = raw
            .filter((p) => !p.bezierFirst && !p.bezierSecond)
            .map((p) => ({ x: p.x, y: p.y }));
        const first = raw[0];
        const text = nText > 0 ? reader.ocadText(nText * 4) : "";
        let objectString = "";
        if (nObjectString > 0) {
            reader.pop();
            reader.push(pos + headerBytes + (nItem + nText) * 8);
            // Counted in 4-byte units; never past the object's own record.
            const units = Math.min(nObjectString * 2, Math.max(0, (size - headerBytes) / 2));
            objectString = reader.ocadText(units);
        }
        return {
            sym,
            otp,
            status,
            angle,
            at: first ? { x: first.x, y: first.y } : null,
            points,
            text,
            objectString,
        };
    }
    finally {
        reader.pop();
    }
}
/** Course length along straight legs, in whole metres; points are in millimetres. */
function straightLength(points, scale) {
    if (points.length < 2)
        return undefined;
    let millimetres = 0;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (a && b)
            millimetres += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return Math.round((millimetres * scale) / 1000);
}
