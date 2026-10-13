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
  ellipsoid: { a: number; f: number };
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

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const nonNegative = (v: unknown): number | undefined => {
  const n = finite(v);
  return n !== undefined && n >= 0 ? n : undefined;
};
const positive = (v: unknown): number | undefined => {
  const n = finite(v);
  return n !== undefined && n > 0 ? n : undefined;
};
const text = (v: unknown): string | undefined =>
  typeof v === "string" && v !== "" ? v : undefined;

const KINDS: readonly ExchangeControlKind[] = ["start", "control", "crossing", "finish"];

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
export function parseCourseExchange(value: unknown): CourseExchange | null {
  if (!isObj(value)) return null;

  const controls: ExchangeControl[] = [];
  const ids = new Set<string>();
  for (const raw of Array.isArray(value["controls"]) ? value["controls"] : []) {
    const control = parseControl(raw);
    if (!control || ids.has(control.id)) continue;
    ids.add(control.id);
    controls.push(control);
  }

  const courses: ExchangeCourse[] = [];
  for (const raw of Array.isArray(value["courses"]) ? value["courses"] : []) {
    const course = parseCourse(raw, ids);
    if (course) courses.push(course);
  }

  const map = parseMap(value["map"]);
  return { ...(map ? { map } : {}), controls, courses };
}

function parseControl(raw: unknown): ExchangeControl | null {
  if (!isObj(raw)) return null;
  const id = text(raw["id"]);
  const kind = KINDS.find((k) => k === raw["kind"]);
  const x = finite(raw["x"]);
  const y = finite(raw["y"]);
  if (!id || !kind || x === undefined || y === undefined) return null;
  const codes = Array.isArray(raw["codes"])
    ? raw["codes"].filter((c): c is number => Number.isInteger(c) && (c as number) >= 0)
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

const idList = (v: unknown, known: Set<string>): string[] =>
  Array.isArray(v) ? v.filter((id): id is string => typeof id === "string" && known.has(id)) : [];

function parseCourse(raw: unknown, known: Set<string>): ExchangeCourse | null {
  if (!isObj(raw)) return null;
  const id = text(raw["id"]);
  if (!id) return null;
  const name = typeof raw["name"] === "string" ? raw["name"] : "";
  const order: ExchangeCourseOrder = raw["order"] === "free" ? "free" : "fixed";
  const lengthMeters = nonNegative(raw["lengthMeters"]);
  const climbMeters = nonNegative(raw["climbMeters"]);
  const printScale = positive(raw["printScale"]);

  let scores: Record<string, number> | undefined;
  if (isObj(raw["scores"])) {
    for (const [controlId, points] of Object.entries(raw["scores"])) {
      const p = finite(points);
      if (p === undefined || !known.has(controlId)) continue;
      (scores ??= {})[controlId] = p;
    }
  }

  let variations: ExchangeVariation[] | undefined;
  if (Array.isArray(raw["variations"])) {
    const codes = new Set<string>();
    for (const v of raw["variations"]) {
      if (!isObj(v)) continue;
      const code = text(v["code"]);
      if (!code || codes.has(code)) continue;
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

function parseMap(raw: unknown): ExchangeMap | null {
  if (!isObj(raw)) return null;
  const scale = positive(raw["scale"]);
  const metersPerUnit = positive(raw["metersPerUnit"]);
  const georeference = parseGeoreference(raw["georeference"]);
  const map: ExchangeMap = {
    ...(scale !== undefined ? { scale } : {}),
    ...(metersPerUnit !== undefined ? { metersPerUnit } : {}),
    ...(georeference ? { georeference } : {}),
  };
  return Object.keys(map).length > 0 ? map : null;
}

function parseGeoreference(raw: unknown): ExchangeGeoreference | null {
  if (!isObj(raw) || !isObj(raw["projection"])) return null;
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
  if (Object.values(values).some((v) => v === undefined)) return null;
  const v = values as { [K in keyof typeof values]: number };
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
