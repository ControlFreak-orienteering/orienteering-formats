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
import type { ExchangeControl } from "../exchange.js";
import type { OcadCourses, OcadSpecial } from "../ocad/courses.js";

/**
 * What a course-setting file says beyond the courses, in the form `readOcadCourses` gives
 * it: millimetres on the map with y downwards. Every part is optional.
 */
export type PurplePenLayout = Partial<
  Pick<
    OcadCourses,
    "specials" | "printScale" | "printArea" | "descriptionCellMm" | "courseSymbols" | "descriptions"
  >
>;

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
  | { kind: "forked-split"; course: string; variations: number }
  /** A forked course of which only the first variation was read. */
  | { kind: "partly-read"; course: string }
  /** Marked routes (snitslade sträckor) are not written. */
  | { kind: "taped-routes-left-out"; course: string }
  /** Relay teams' variations have no place in Purple Pen. */
  | { kind: "team-courses-left-out" }
  /** No print scale was given or in the layout: this one fits the courses on A4. */
  | { kind: "print-scale-chosen"; scale: number }
  /** No descriptions position in the layout: they are placed right of the courses. */
  | { kind: "descriptions-placed" }
  /** Purple Pen has one descriptions block per course; the later ones are left out. */
  | { kind: "extra-descriptions-left-out" };

/** A4 in hundredths of an inch, as Purple Pen gives the page. */
const A4 = { width: 827, height: 1169 };

/** Common print scales, sprint to forest. */
const PRINT_SCALES = [4000, 5000, 7500, 10000, 15000];
/** Margin around the courses on the page, for circles and numbers (mm). */
const PAGE_MARGIN_MM = 15;
/** The descriptions' width on the page beside the courses: eight 6 mm cells and some air. */
const DESCRIPTION_WIDTH_MM = 55;
/** A description cell when the layout does not give one: 6 mm on the page. */
const DEFAULT_CELL_PAPER_MM = 6;

const KINDS: Record<ExchangeControl["kind"], string> = {
  start: "start",
  control: "normal",
  crossing: "crossing-point",
  finish: "finish",
};

const SPECIAL_KINDS: Record<OcadSpecial["kind"], string> = {
  boundary: "boundary",
  crossing: "optional-crossing-point",
  "out-of-bounds": "out-of-bounds",
  dangerous: "dangerous-area",
  "forbidden-route": "forbidden-route",
  "first-aid": "first-aid",
  water: "water",
  "registration-mark": "registration-mark",
  "white-out": "white-out",
  descriptions: "descriptions",
  text: "text",
};

/** Numbers as Purple Pen writes them: a point as decimal sign, six decimals. */
function n(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 1e6) / 1e6) : "0";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * How Purple Pen scales the course symbols (`<course-appearance>`), and the map standard.
 * Without the element Purple Pen does not scale them at all (`CourseView.CourseObjRatio`):
 * a circle is as big on paper at every print scale, and looks tiny on an enlarged map.
 *
 * - With the file's own sizes (`courseSymbols`): `RelativeToMap`, sizes in the map's
 *   millimetres as in OCAD, the circle and line as ratios to ISOM 2017's 5 mm and 0.35 mm;
 *   the numbers follow the circle.
 * - Otherwise by the map's scale (not the print scale), as ControlFreak writes it: a
 *   sprint map (1:5000 or larger) with ISSprOM 2019's sizes at 1:4000, a forest map with
 *   ISOM 2017's at 1:15 000, which grow with the map when it is enlarged.
 */
function courseAppearance(
  mapScale: number,
  symbols: PurplePenLayout["courseSymbols"],
): { standard: string; line: string } {
  const ratio = (name: string, r: number) =>
    Math.abs(r - 1) < 1e-6 ? "" : ` ${name}="${Number(r.toFixed(4))}"`;
  const tail = 'scale-sizes-circle-gaps="true"';
  if (symbols?.controlDiameterMm) {
    const circle = symbols.controlDiameterMm / 5;
    const line = (symbols.lineWidthMm ?? 0.35) / 0.35;
    return {
      standard: "2017",
      line: `<course-appearance${ratio("control-circle-size-ratio", circle)}${ratio("line-width-ratio", line)}${ratio("number-size-ratio", circle)} scale-sizes="RelativeToMap" ${tail} />`,
    };
  }
  if (mapScale <= 5000) {
    const r = 4000 / mapScale;
    return {
      standard: "Spr2019",
      line: `<course-appearance${ratio("control-circle-size-ratio", r)}${ratio("line-width-ratio", r)}${ratio("number-size-ratio", r)} scale-sizes="RelativeToMap" ${tail} />`,
    };
  }
  return { standard: "2017", line: `<course-appearance scale-sizes="RelativeTo15000" ${tail} />` };
}

type Bounds = { left: number; right: number; top: number; bottom: number };

/**
 * The largest common scale (at most the map's) at which the courses, with margins and the
 * descriptions beside them, fit on A4 either way; otherwise the map's scale.
 */
function fittingScale(bounds: Bounds, mapScale: number): number {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const fits = (scale: number) => {
    // Millimetres on the map at its scale become this many on the page.
    const w = (width * mapScale) / scale + 2 * PAGE_MARGIN_MM + DESCRIPTION_WIDTH_MM;
    const h = (height * mapScale) / scale + 2 * PAGE_MARGIN_MM;
    return (w <= 297 && h <= 210) || (w <= 210 && h <= 297);
  };
  return PRINT_SCALES.find((s) => s <= mapScale && fits(s)) ?? mapScale;
}

/** A course as written: a plain course, or one variation of a forked one. */
type Written = {
  /** The set's course id, for special objects that belong to it. */
  from: string;
  name: string;
  controls: string[];
  score: boolean;
  scores?: Record<string, number>;
  climb?: number;
};

/**
 * Writes a `CourseSet` as a Purple Pen file. Positions are millimetres on the map at
 * `options.scale` with y downwards, as the readers in this package give them.
 *
 * @returns The file's text, and what did not fit or was chosen.
 */
export function writePurplePen(
  set: CourseSet,
  options: WritePurplePenOptions,
): { text: string; notes: PurplePenNote[] } {
  const notes: PurplePenNote[] = [];
  const layout = options.layout ?? {};
  const written: Written[] = [];
  for (const course of set.courses) {
    const score = course.order === "free";
    const base = {
      from: course.id,
      score,
      ...(course.scores ? { scores: course.scores } : {}),
      ...(course.climbMeters !== undefined ? { climb: course.climbMeters } : {}),
    };
    const variations = course.variations ?? [];
    if (variations.length > 0) {
      notes.push({ kind: "forked-split", course: course.name, variations: variations.length });
      for (const v of variations) {
        written.push({ ...base, name: `${course.name} ${v.code}`, controls: v.controls });
      }
    } else {
      written.push({ ...base, name: course.name, controls: course.controls });
      if (course.partlyRead) notes.push({ kind: "partly-read", course: course.name });
    }
    if (course.tapedRoutes?.length) notes.push({ kind: "taped-routes-left-out", course: course.name });
  }
  if (set.teamCourses?.length) notes.push({ kind: "team-courses-left-out" });

  // The points some course uses, numbered from 1 as Purple Pen does.
  const used = new Set(written.flatMap((w) => w.controls));
  // The finish's symbol: Purple Pen crashes without it, since the descriptions' last row
  // (the leg to the finish) is drawn with it. 14.3 is "no tapes"; a taped last leg in the
  // set gives 14.1 or 14.2.
  const finishSymbol = new Map<string, string>();
  for (const course of set.courses) {
    const last = course.controls.length - 1;
    const id = course.controls[last];
    if (id === undefined || finishSymbol.has(id)) continue;
    const taped = course.tapedRoutes?.find((r) => r.to === last);
    finishSymbol.set(id, taped ? (taped.kind === "all" ? "14.1" : "14.2") : "14.3");
  }
  // The courses' extent in mm (y downwards), for the print area and the descriptions.
  const usedPoints = set.controls.filter((c) => used.has(c.id));
  const bounds: Bounds = {
    left: Math.min(...usedPoints.map((c) => c.x)),
    right: Math.max(...usedPoints.map((c) => c.x)),
    top: Math.min(...usedPoints.map((c) => c.y)),
    bottom: Math.max(...usedPoints.map((c) => c.y)),
  };
  // The print scale: the given one, else the layout's, else the largest common scale at
  // which the courses fit on A4 (Purple Pen's automatic print area is an A4 at the print
  // scale, so the map's own scale often gives a sheet with mostly other things on it).
  let printScale = options.printScale ?? layout.printScale;
  if (printScale === undefined) {
    printScale = usedPoints.length > 0 ? fittingScale(bounds, options.scale) : options.scale;
    notes.push({ kind: "print-scale-chosen", scale: printScale });
  }
  // Purple Pen's rectangle has y upwards; "top" is the largest y. Without a print area in
  // the layout it is Purple Pen's automatic one on A4, which Purple Pen works out when the
  // file is opened (the rectangle is there for older versions).
  const area = layout.printArea;
  const rect = (r: Bounds) =>
    `left="${n(r.left)}" top="${n(-r.top)}" right="${n(r.right)}" bottom="${n(-r.bottom)}"`;
  const landscape = bounds.right - bounds.left > bounds.bottom - bounds.top;
  const printArea = area
    ? `<print-area automatic="false" restrict-to-page-size="false" ${rect(area)} />`
    : usedPoints.length > 0
      ? `<print-area automatic="true" restrict-to-page-size="true" ${rect(bounds)} page-width="${A4.width}" page-height="${A4.height}" page-margins="0" page-landscape="${landscape}" />`
      : "";

  const idOf = new Map<string, number>();
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  if (options.creator) lines.push(`<!-- ${escapeXml(options.creator)} -->`);
  lines.push("<course-scribe-event>");
  lines.push('  <event id="1">');
  lines.push(`    <title>${escapeXml(options.title ?? "")}</title>`);
  lines.push(
    `    <map kind="OCAD" scale="${n(options.scale)}" ignore-missing-fonts="false">${escapeXml(options.mapFileName ?? "")}</map>`,
  );
  const appearance = courseAppearance(options.scale, layout.courseSymbols);
  lines.push(`    <standards map="${appearance.standard}" description="2018" />`);
  lines.push(`    <all-controls print-scale="${n(printScale)}" description-kind="symbols" />`);
  // Right after <all-controls>, as Purple Pen writes it.
  if (printArea) lines.push(`    ${printArea}`);
  lines.push('    <numbering start="31" disallow-invertible="false" />');
  lines.push(`    ${appearance.line}`);
  lines.push(`    <descriptions lang="${escapeXml(options.descriptionLang ?? "sv")}" color="black" />`);
  lines.push("  </event>");

  for (const c of set.controls) {
    if (!used.has(c.id)) continue;
    const id = idOf.size + 1;
    idOf.set(c.id, id);
    const orientation = c.kind === "crossing" ? ' orientation="0"' : "";
    lines.push(`  <control id="${id}" kind="${KINDS[c.kind]}"${orientation}>`);
    const code = c.codes[0];
    if (c.kind === "control" && code !== undefined) lines.push(`    <code>${code}</code>`);
    lines.push(`    <location x="${n(c.x)}" y="${n(-c.y)}" />`);
    // The control description, column by column, as Purple Pen writes it.
    const description = c.kind === "control" ? layout.descriptions?.[c.id] : undefined;
    for (const box of ["C", "D", "E", "F", "G", "H"] as const) {
      const ref = description?.[box];
      if (ref) lines.push(`    <description box="${box}" iof-2004-ref="${escapeXml(ref)}" />`);
    }
    if (c.kind === "crossing") lines.push('    <description box="all" iof-2004-ref="13.3" />');
    if (c.kind === "finish") {
      lines.push(`    <description box="all" iof-2004-ref="${finishSymbol.get(c.id) ?? "14.3"}" />`);
    }
    lines.push("  </control>");
  }

  // The chains, one entry per point of the course; the entries' ids run over the file.
  type Link = { id: number; control: number; next?: number; points?: number };
  const links: Link[] = [];
  const firsts: (number | undefined)[] = [];
  for (const w of written) {
    const chain: Link[] = [];
    for (const pointId of w.controls) {
      const control = idOf.get(pointId);
      if (control === undefined) continue;
      const points = w.score ? w.scores?.[pointId] : undefined;
      chain.push({ id: links.length + chain.length + 1, control, ...(points ? { points } : {}) });
    }
    chain.forEach((link, i) => {
      const next = chain[i + 1];
      if (next) link.next = next.id;
    });
    firsts.push(chain[0]?.id);
    links.push(...chain);
  }

  written.forEach((w, i) => {
    lines.push(`  <course id="${i + 1}" kind="${w.score ? "score" : "normal"}" order="${i + 1}">`);
    lines.push(`    <name>${escapeXml(w.name)}</name>`);
    lines.push(`    <labels label-kind="${w.score ? "code" : "sequence"}" />`);
    const first = firsts[i];
    if (first !== undefined) lines.push(`    <first course-control="${first}" />`);
    if (printArea) lines.push(`    ${printArea}`);
    lines.push(
      `    <options print-scale="${n(printScale)}" description-kind="symbols"${
        w.climb !== undefined ? ` climb="${n(w.climb)}"` : ""
      } />`,
    );
    lines.push("  </course>");
  });

  for (const link of links) {
    const attrs = `id="${link.id}" control="${link.control}"${link.points ? ` points="${link.points}"` : ""}`;
    if (link.next === undefined) lines.push(`  <course-control ${attrs} />`);
    else {
      lines.push(`  <course-control ${attrs}>`);
      lines.push(`    <next course-control="${link.next}" />`);
      lines.push("  </course-control>");
    }
  }

  const specials = [...(layout.specials ?? [])];
  // The layout's cell size belongs to descriptions the course setter placed.
  const placed = specials.some((s) => s.kind === "descriptions");
  // Without placed descriptions: one right of the courses, at the top, to move in Purple
  // Pen. Without it no descriptions show on the map at all.
  if (usedPoints.length > 0 && !placed) {
    const gap = (DEFAULT_CELL_PAPER_MM * printScale) / options.scale;
    specials.push({ kind: "descriptions", points: [{ x: bounds.right + 2 * gap, y: bounds.top }] });
    notes.push({ kind: "descriptions-placed" });
  }
  const cell =
    placed && layout.descriptionCellMm
      ? layout.descriptionCellMm
      : (DEFAULT_CELL_PAPER_MM * printScale) / options.scale;
  lines.push(...specialLines(specials, cell, written, printScale, options.scale, notes));
  lines.push("</course-scribe-event>");
  return { text: lines.join("\n") + "\n", notes };
}

/** The special objects as `<special-object>`, in the form Purple Pen writes them. */
function specialLines(
  specials: OcadSpecial[],
  cell: number,
  written: Written[],
  printScale: number,
  mapScale: number,
  notes: PurplePenNote[],
): string[] {
  const lines: string[] = [];
  // The courses' numbers in the file, per course of the set (a forked one became several).
  const ids = new Map<string, number[]>();
  written.forEach((w, i) => ids.set(w.from, [...(ids.get(w.from) ?? []), i + 1]));
  const up = (p: { x: number; y: number }) => ({ x: p.x, y: -p.y });
  const location = (p: { x: number; y: number }) => `    <location x="${n(p.x)}" y="${n(p.y)}" />`;
  // Purple Pen allows one descriptions block per course.
  let descriptions = false;
  let id = 1;
  for (const s of specials) {
    let locations = s.points.map(up);
    const body: string[] = [];
    if (s.kind === "descriptions") {
      if (descriptions) {
        notes.push({ kind: "extra-descriptions-left-out" });
        continue;
      }
      descriptions = true;
      const corner = locations[0];
      if (!corner) continue;
      locations = [corner, { x: corner.x + cell, y: corner.y }];
      body.push('    <appearance columns="1" />');
    } else if (s.kind === "text") {
      const text =
        s.field === "course-name"
          ? "$(CourseName)"
          : s.field === "event-name"
            ? "$(EventTitle)"
            : (s.text ?? "");
      // The box around the text: OCAD gives the anchor and then the box's corners; without
      // a box, a guess from the text's length.
      const box = locations.length >= 3 ? locations.slice(1) : locations;
      const xs = box.map((p) => p.x);
      const ys = box.map((p) => p.y);
      let left = Math.min(...xs);
      let right = Math.max(...xs);
      const bottom = Math.min(...ys);
      let top = Math.max(...ys);
      if (right - left < 0.5 || top - bottom < 0.5) {
        const height = (4 * printScale) / mapScale;
        right = left + Math.max(1, text.length) * height * 0.6;
        top = bottom + height;
      }
      locations = [
        { x: left, y: top },
        { x: right, y: bottom },
      ];
      body.push(`    <text>${escapeXml(text)}</text>`);
      body.push('    <font name="Arial" bold="false" italic="false" />');
      body.push('    <appearance color="purple" />');
    }
    const orientation = s.kind === "crossing" ? ` orientation="${n(s.angle ?? 0)}"` : "";
    lines.push(`  <special-object id="${id++}" kind="${SPECIAL_KINDS[s.kind]}"${orientation}>`);
    lines.push(...body, ...locations.map(location));
    if (!s.courses) lines.push('    <courses all="true" />');
    else {
      lines.push("    <courses>");
      for (const c of s.courses.flatMap((from) => ids.get(from) ?? [])) {
        lines.push(`      <course course="${c}" />`);
      }
      lines.push("    </courses>");
    }
    lines.push("  </special-object>");
  }
  return lines;
}
