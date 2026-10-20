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
 * Positions: `<MapPosition>` is millimetres on the printed map. The 3.0 values are
 * given as the file has them, while 2.0.3 exports (e.g. OCAD) count y upwards and are
 * flipped to the exchange section's y-down rule. `<Position>` (3.0 only) gives
 * `lat`/`lng`, which a program writes only when its map is georeferenced.
 */

import type { CourseSet, CourseSetCourse } from "../courses.js";
import { FormatError } from "../errors.js";
import type { ExchangeControl, ExchangeControlKind, ExchangeVariation } from "../exchange.js";
import {
  childElement,
  childElements,
  childText,
  numberOf,
  parseXmlRoot,
  positiveNumberOf,
  type XmlParse,
} from "../xml.js";

/** Which IOF XML version a CourseData file uses. */
export type IofVersion = "3.0" | "2.0.3";

/** The courses of a CourseData file, with what the file says about itself. */
export type IofCourseData = CourseSet & {
  /** Which version the file was written in. */
  version: IofVersion;
  /** The event's name, or "" when the file has none. */
  eventName: string;
};

/** Options for `readIofCourseData`. */
export type ReadIofOptions = {
  /** How the XML is parsed; the browser's `DOMParser` when not given. */
  parseXml?: XmlParse;
};

/** Whether XML text looks like an IOF CourseData file (checks the root element only). */
export function looksLikeIofCourseData(xml: string): boolean {
  return /<(?:\w+:)?CourseData[\s>]/.test(xml.slice(0, 2000));
}

/**
 * Reads an IOF XML CourseData file, version 3.0 or 2.0.3.
 *
 * @param xml - The file's text; see `decodeXmlBytes` for getting it from bytes.
 * @throws {FormatError} `unreadable` for broken XML, `wrong-format` when the root is
 *   not `CourseData`, and `empty` when the file has no courses.
 */
export function readIofCourseData(xml: string, options: ReadIofOptions = {}): IofCourseData {
  const root = parseXmlRoot(xml, options.parseXml);
  if (root.localName !== "CourseData") throw new FormatError("wrong-format");
  const eventName = childText(childElement(root, "Event"), "Name");
  // 3.0 marks itself with an attribute; 2.0.3 with an <IOFVersion> element.
  const version3 =
    root.getAttribute("iofVersion")?.startsWith("3") ||
    (childElements(root, "IOFVersion").length === 0 &&
      childElements(root, "RaceCourseData").length > 0);
  return version3
    ? { ...readVersion3(root), version: "3.0", eventName }
    : { ...readVersion2(root), version: "2.0.3", eventName };
}

/** The map facts the file gives: positions are millimetres at the stated scale. */
function mapFacts(scaleText: string): Pick<CourseSet, "map"> {
  const scale = positiveNumberOf(scaleText);
  return scale ? { map: { scale, metersPerUnit: scale / 1000 } } : {};
}

// ---------------------------------------------------------------- IOF XML 3.0

/** IOF 3.0 control types as exchange kinds. */
const KIND_V3: Record<string, ExchangeControlKind | undefined> = {
  Control: "control",
  Start: "start",
  Finish: "finish",
  CrossingPoint: "crossing",
  // The end of a taped route works like a crossing point: passed, not punched.
  EndOfMarkedRoute: "crossing",
};

function readVersion3(root: Element): CourseSet {
  // A file may hold several races; the first one is used.
  const race = childElement(root, "RaceCourseData");
  if (!race) throw new FormatError("empty");
  const courseElements = childElements(race, "Course");
  if (courseElements.length === 0) throw new FormatError("empty");

  // Points referenced as start/finish/crossing in a course take that kind, even if the
  // <Control> element itself has no type (common in exports).
  const kindFromCourses = new Map<string, ExchangeControlKind>();
  for (const course of courseElements) {
    for (const cc of childElements(course, "CourseControl")) {
      const kind = KIND_V3[cc.getAttribute("type") ?? ""];
      if (!kind || kind === "control") continue;
      for (const ref of childElements(cc, "Control")) {
        const id = (ref.textContent ?? "").trim();
        if (id) kindFromCourses.set(id, kind);
      }
    }
  }

  const controls: ExchangeControl[] = [];
  const known = new Set<string>();
  for (const element of childElements(race, "Control")) {
    const id = childText(element, "Id");
    if (!id || known.has(id)) continue;
    known.add(id);
    const kind =
      KIND_V3[element.getAttribute("type") ?? ""] ?? kindFromCourses.get(id) ?? "control";
    // Punch codes: the punching units if listed, otherwise the id when it is a number
    // (the id is usually the code printed on the map).
    const units = childElements(element, "PunchingUnitId")
      .map((u) => numberOf(u.textContent))
      .filter((n): n is number => n !== undefined && Number.isInteger(n) && n >= 0);
    const idAsCode = /^\d+$/.test(id) ? [Number(id)] : [];
    const position = childElement(element, "Position");
    const mapPosition = childElement(element, "MapPosition");
    const lat = numberOf(position?.getAttribute("lat"));
    const lng = numberOf(position?.getAttribute("lng"));
    controls.push({
      id,
      kind,
      codes: kind === "control" ? (units.length > 0 ? units : idAsCode) : [],
      ...(kind === "control" ? {} : { label: id }),
      x: numberOf(mapPosition?.getAttribute("x")) ?? 0,
      y: numberOf(mapPosition?.getAttribute("y")) ?? 0,
      ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
    });
  }

  // Class names per course name, from <ClassCourseAssignment>.
  const classesByCourse = new Map<string, string[]>();
  for (const assignment of childElements(race, "ClassCourseAssignment")) {
    const className = childText(assignment, "ClassName");
    if (!className) continue;
    for (const courseName of childElements(assignment, "CourseName")) {
      const name = (courseName.textContent ?? "").trim();
      if (name) classesByCourse.set(name, [...(classesByCourse.get(name) ?? []), className]);
    }
  }

  const courses: CourseSetCourse[] = courseElements.map((element, index) => {
    const name = childText(element, "Name");
    const courseControls = childElements(element, "CourseControl");
    // Points on the controls, or any order (`randomOrder`, as Hittaut-like courses are
    // written): both mean the controls are not taken in a fixed sequence.
    const free =
      element.getAttribute("randomOrder") === "true" ||
      courseControls.some(
        (cc) => childElement(cc, "Score") !== undefined || cc.getAttribute("randomOrder") === "true",
      );
    const sequence: string[] = [];
    let scores: Record<string, number> | undefined;
    for (const cc of courseControls) {
      // When a course control lists alternatives, the first one is used.
      const id = childText(cc, "Control");
      if (!id) continue;
      sequence.push(id);
      // A point a course refers to but the file does not define is kept as a control
      // without a position, so the course keeps its order and the app can say what is
      // missing.
      if (!known.has(id)) {
        known.add(id);
        controls.push({
          id,
          kind: kindFromCourses.get(id) ?? "control",
          codes: /^\d+$/.test(id) ? [Number(id)] : [],
          x: 0,
          y: 0,
        });
      }
      const points = numberOf(childText(cc, "Score"));
      if (points !== undefined && !(scores && id in scores)) (scores ??= {})[id] = points;
    }
    const lengthMeters = positiveNumberOf(childText(element, "Length"));
    const climbMeters = numberOf(childText(element, "Climb"));
    const family = childText(element, "CourseFamily");
    const classNames = classesByCourse.get(name);
    return {
      id: childText(element, "Id") || name || `course${index + 1}`,
      name,
      order: free ? "free" : "fixed",
      controls: sequence,
      ...(lengthMeters !== undefined ? { lengthMeters } : {}),
      ...(climbMeters !== undefined && climbMeters >= 0 ? { climbMeters } : {}),
      ...(scores ? { scores } : {}),
      ...(family ? { family } : {}),
      ...(classNames ? { classNames } : {}),
    };
  });

  return { ...mapFacts(childText(childElement(race, "Map"), "Scale")), controls, courses };
}

// -------------------------------------------------------------- IOF XML 2.0.3

function readVersion2(root: Element): CourseSet {
  const controls: ExchangeControl[] = [];
  const known = new Set<string>();

  /** Reads one kind of point: <StartPoint>, <Control> or <FinishPoint>. */
  const readPoints = (elementName: string, codeName: string, kind: ExchangeControlKind) => {
    for (const element of childElements(root, elementName)) {
      const code = childText(element, codeName);
      const id = `${kind}:${code}`;
      if (!code || known.has(id)) continue;
      known.add(id);
      const mapPosition = childElement(element, "MapPosition");
      controls.push({
        id,
        kind,
        codes: kind === "control" && /^\d+$/.test(code) ? [Number(code)] : [],
        ...(kind === "control" ? {} : { label: code }),
        x: numberOf(mapPosition?.getAttribute("x")) ?? 0,
        // 2.0.3 exports (e.g. OCAD) count y upwards; the exchange rule is y downwards.
        y: -(numberOf(mapPosition?.getAttribute("y")) ?? 0),
      });
    }
  };
  readPoints("StartPoint", "StartPointCode", "start");
  readPoints("Control", "ControlCode", "control");
  readPoints("FinishPoint", "FinishPointCode", "finish");

  /** Point ids of one <CourseVariation>, from start to finish. */
  const variationPoints = (variation: Element): string[] => {
    const start = childText(variation, "StartPointCode");
    const finish = childText(variation, "FinishPointCode");
    const middle = childElements(variation, "CourseControl")
      .map((cc) => ({
        sequence: numberOf(childText(cc, "Sequence")) ?? 0,
        code: childText(cc, "ControlCode"),
      }))
      .sort((a, b) => a.sequence - b.sequence)
      .flatMap(({ code }) => (code ? [`control:${code}`] : []));
    return [...(start ? [`start:${start}`] : []), ...middle, ...(finish ? [`finish:${finish}`] : [])];
  };

  const courseElements = childElements(root, "Course");
  if (courseElements.length === 0) throw new FormatError("empty");

  const courses: CourseSetCourse[] = courseElements.map((element, index) => {
    const name = childText(element, "CourseName");
    const variations = childElements(element, "CourseVariation");
    const first = variations[0];
    const classNames = childElements(element, "ClassShortName")
      .map((c) => (c.textContent ?? "").trim())
      .filter((c) => c !== "");
    const lengthMeters = positiveNumberOf(childText(first, "CourseLength"));
    const climbMeters = numberOf(childText(first, "CourseClimb"));
    // Several variations in one course means a forked course.
    const forks: ExchangeVariation[] | undefined =
      variations.length > 1
        ? variations.map((variation, i) => {
            const length = positiveNumberOf(childText(variation, "CourseLength"));
            return {
              code:
                childText(variation, "Name") ||
                childText(variation, "CourseVariationId") ||
                String(i + 1),
              controls: variationPoints(variation),
              ...(length !== undefined ? { lengthMeters: length } : {}),
            };
          })
        : undefined;
    return {
      id: childText(element, "CourseId") || name || `course${index + 1}`,
      name,
      order: "fixed",
      controls: first ? variationPoints(first) : [],
      ...(lengthMeters !== undefined ? { lengthMeters } : {}),
      ...(climbMeters !== undefined && climbMeters >= 0 ? { climbMeters } : {}),
      ...(forks ? { variations: forks } : {}),
      ...(classNames.length > 0 ? { classNames } : {}),
    };
  });

  return { ...mapFacts(childText(childElement(root, "Map"), "Scale")), controls, courses };
}
