/**
 * Reads courses from Purple Pen files (.ppen).
 *
 * Purple Pen (purplepen.golde.org) is a free course-setting program. Its project file
 * is XML with the root `<course-scribe-event>`. The parts read here:
 *
 * - `<event><title>` and `<map scale="15000">karta.ocd</map>`: the event's name, the
 *   map's scale and the map file the courses were set on.
 * - `<control id kind>` with `<code>` and `<location x y>`: the points. `kind` is
 *   `start`, `normal`, `finish`, `crossing-point`, `map-issue` or `map-exchange`.
 *   Locations are millimetres on the map with y upwards, from the map file's origin.
 * - `<course id kind order>` with `<name>`, `<first course-control>` and
 *   `<options climb course-length>`. `kind` is `normal` or `score`.
 * - `<course-control id control points>` with `<next course-control>`: a linked list
 *   from the course's first course-control to its finish.
 *
 * A `.ppen` has no positions on the earth. Where the map lies is in the map file it
 * names, so an app that needs `lat`/`lng` reads that map's georeference (see
 * `orienteering-formats/map`) and converts the millimetres.
 *
 * Purple Pen does not store course lengths unless the course setter typed one in; it
 * computes them from the control positions. This reader does the same with straight
 * legs, so lengths can differ slightly from Purple Pen's when legs are bent around
 * obstacles.
 *
 * Forked courses (`variation="fork"` or `"loop"` on course-controls) are read along
 * their first variation only and marked `partlyRead`, so the app can tell the user.
 *
 * The format was studied from Purple Pen's documentation and sample files; no Purple
 * Pen code is used.
 */

import type { CourseSet, CourseSetCourse } from "../courses.js";
import { FormatError } from "../errors.js";
import type { ExchangeControl, ExchangeControlKind } from "../exchange.js";
import {
  childElement,
  childElements,
  childText,
  numberOf,
  parseXmlRoot,
  positiveNumberOf,
  type XmlParse,
} from "../xml.js";

/** The courses of a Purple Pen file, with what the file says about itself. */
export type PurplePenCourses = CourseSet & {
  /** The event's title, or "" when the file has none. */
  title: string;
  /** The map file's name as the file gives it, without directories; "" when unknown. */
  mapFileName: string;
};

/** Options for `readPurplePen`. */
export type ReadPurplePenOptions = {
  /** How the XML is parsed; the browser's `DOMParser` when not given. */
  parseXml?: XmlParse;
};

/** Purple Pen point kinds as exchange kinds. Map issue and exchange points are skipped. */
const KINDS: Record<string, ExchangeControlKind | undefined> = {
  start: "start",
  normal: "control",
  finish: "finish",
  "crossing-point": "crossing",
};

/** Whether XML text looks like a Purple Pen file (checks the root element only). */
export function looksLikePurplePen(xml: string): boolean {
  return xml.slice(0, 500).includes("<course-scribe-event");
}

/**
 * Reads a Purple Pen (.ppen) file.
 *
 * @param xml - The file's text; see `decodeXmlBytes` for getting it from bytes.
 * @throws {FormatError} `unreadable` for broken XML, `wrong-format` when the root is
 *   not `course-scribe-event`, and `empty` when the file has no courses.
 */
export function readPurplePen(xml: string, options: ReadPurplePenOptions = {}): PurplePenCourses {
  const root = parseXmlRoot(xml, options.parseXml);
  if (root.localName !== "course-scribe-event") throw new FormatError("wrong-format");
  const event = childElement(root, "event");
  const mapElement = childElement(event ?? root, "map");
  const scale = positiveNumberOf(mapElement?.getAttribute("scale"));
  const mapText = (mapElement?.textContent ?? "").trim();
  const mapFileName = mapText.split(/[\\/]/).pop() ?? "";

  // Points, with their positions for the length calculation.
  const positions = new Map<string, { x: number; y: number }>();
  const controls: ExchangeControl[] = [];
  for (const element of childElements(root, "control")) {
    const id = element.getAttribute("id");
    const kind = KINDS[element.getAttribute("kind") ?? ""];
    if (!id || !kind || positions.has(id)) continue;
    const location = childElement(element, "location");
    const x = numberOf(location?.getAttribute("x")) ?? 0;
    // Purple Pen counts y upwards; the exchange rule is y downwards.
    const y = -(numberOf(location?.getAttribute("y")) ?? 0);
    positions.set(id, { x, y });
    const code = numberOf(childText(element, "code"));
    controls.push({
      id,
      kind,
      codes: kind === "control" && code !== undefined && Number.isInteger(code) && code > 0 ? [code] : [],
      ...(kind === "start" ? { label: "S" } : kind === "finish" ? { label: "M" } : {}),
      x,
      y,
    });
  }

  const courseControls = new Map<string, Element>();
  for (const element of childElements(root, "course-control")) {
    const id = element.getAttribute("id");
    if (id && !courseControls.has(id)) courseControls.set(id, element);
  }

  // Courses in the order Purple Pen shows them, when the file says it.
  const courseElements = childElements(root, "course")
    .map((element, index) => ({ element, index, order: numberOf(element.getAttribute("order")) }))
    .sort((a, b) => (a.order ?? a.index) - (b.order ?? b.index) || a.index - b.index)
    .map((c) => c.element);
  if (courseElements.length === 0) throw new FormatError("empty");

  const courses: CourseSetCourse[] = courseElements.map((element, index) => {
    const name = childText(element, "name");
    const options = childElement(element, "options");
    const score = element.getAttribute("kind") === "score";

    // Walk the linked list of course-controls from the first to the end, following
    // `next`, which goes along the first variation of a fork.
    const sequence: string[] = [];
    let scores: Record<string, number> | undefined;
    let forked = false;
    let currentId = childElement(element, "first")?.getAttribute("course-control") ?? null;
    const visited = new Set<string>();
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const courseControl = courseControls.get(currentId);
      if (!courseControl) break;
      if (courseControl.getAttribute("variation")) forked = true;
      const pointId = courseControl.getAttribute("control") ?? "";
      if (positions.has(pointId)) {
        sequence.push(pointId);
        const points = numberOf(courseControl.getAttribute("points"));
        if (score && points !== undefined && points > 0 && !(scores && pointId in scores)) {
          (scores ??= {})[pointId] = points;
        }
      }
      currentId = childElement(courseControl, "next")?.getAttribute("course-control") ?? null;
    }

    const typedLength = positiveNumberOf(options?.getAttribute("course-length"));
    const lengthMeters = typedLength ?? straightLength(sequence, positions, scale);
    // Purple Pen writes -1 when no climb is set.
    const climb = numberOf(options?.getAttribute("climb"));
    return {
      id: element.getAttribute("id") || name || `course${index + 1}`,
      name,
      order: score ? "free" : "fixed",
      controls: sequence,
      ...(lengthMeters !== undefined ? { lengthMeters } : {}),
      ...(climb !== undefined && climb >= 0 ? { climbMeters: climb } : {}),
      ...(scores ? { scores } : {}),
      ...(forked ? { partlyRead: true } : {}),
    };
  });

  return {
    title: childText(event, "title"),
    mapFileName,
    // Locations are millimetres on the map at the stated scale.
    ...(scale ? { map: { scale, metersPerUnit: scale / 1000 } } : {}),
    controls,
    courses,
  };
}

/**
 * Course length along straight legs, in whole metres.
 *
 * @param sequence - Point ids from start to finish.
 * @param positions - Point positions in millimetres on the map.
 * @param scale - Map scale denominator; without it no length can be computed.
 */
function straightLength(
  sequence: string[],
  positions: Map<string, { x: number; y: number }>,
  scale: number | undefined,
): number | undefined {
  if (!scale || sequence.length < 2) return undefined;
  let millimetres = 0;
  for (let i = 1; i < sequence.length; i++) {
    const a = positions.get(sequence[i - 1]!);
    const b = positions.get(sequence[i]!);
    if (a && b) millimetres += Math.hypot(b.x - a.x, b.y - a.y);
  }
  // 1 mm on a 1:10 000 map is 10 m on the ground.
  return Math.round((millimetres * scale) / 1000);
}
