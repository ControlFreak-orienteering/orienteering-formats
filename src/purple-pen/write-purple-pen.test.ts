import { describe, expect, it } from "vitest";

import type { CourseSet } from "../courses.js";
import { OcdFileBuilder } from "../map/testing/ocd-builder.js";
import { readOcadCourses } from "../ocad/courses.js";
import { parseXml } from "../test-xml.js";
import { readPurplePen } from "./purple-pen.js";
import { writePurplePen } from "./write-purple-pen.js";

/** S1 at (0, 0), 31 at (30, -40), 32 at (60, 0), M1 at (60, -10): millimetres, y downwards. */
const SET: CourseSet = {
  controls: [
    { id: "S1", kind: "start", codes: [], x: 0, y: 0 },
    { id: "31", kind: "control", codes: [31], x: 30, y: -40 },
    { id: "32", kind: "control", codes: [32], x: 60, y: 0 },
    { id: "M1", kind: "finish", codes: [], x: 60, y: -10 },
  ],
  courses: [
    { id: "a", name: "Lång", order: "fixed", controls: ["S1", "31", "32", "M1"], climbMeters: 25 },
    { id: "b", name: "Poäng", order: "free", controls: ["S1", "31", "32", "M1"], scores: { "31": 10, "32": 20 } },
  ],
};

const elements = (xml: string, tag: string) =>
  Array.from(parseXml(xml).getElementsByTagName(tag)) as Element[];
const locations = (e: Element) =>
  Array.from(e.getElementsByTagName("location")).map((l) => [
    Number(l.getAttribute("x")),
    Number(l.getAttribute("y")),
  ]);

describe("writePurplePen", () => {
  it("writes a file readPurplePen reads back the same", () => {
    const { text } = writePurplePen(SET, { title: "Träning", mapFileName: "Skogen.ocd", scale: 10000 });
    const back = readPurplePen(text, { parseXml });
    expect(back.title).toBe("Träning");
    expect(back.mapFileName).toBe("Skogen.ocd");
    expect(back.map?.scale).toBe(10000);
    expect(back.courses.map((c) => [c.name, c.order, c.climbMeters])).toEqual([
      ["Lång", "fixed", 25],
      ["Poäng", "free", undefined],
    ]);
    const at = (c: (typeof back.courses)[number]) =>
      c.controls.map((id) => {
        const p = back.controls.find((x) => x.id === id)!;
        // `+ 0` makes -0 (a y of 0 flipped twice) plain 0.
        return [p.kind, p.codes[0] ?? null, p.x + 0, p.y + 0];
      });
    expect(at(back.courses[0]!)).toEqual([
      ["start", null, 0, 0],
      ["control", 31, 30, -40],
      ["control", 32, 60, 0],
      ["finish", null, 60, -10],
    ]);
    expect(Object.values(back.courses[1]!.scores ?? {})).toEqual([10, 20]);
  });

  it("gives every finish a finish symbol, without which Purple Pen crashes", () => {
    const { text } = writePurplePen(SET, { scale: 10000 });
    const finish = elements(text, "control").find((c) => c.getAttribute("kind") === "finish")!;
    expect(finish.getElementsByTagName("description")[0]!.getAttribute("iof-2004-ref")).toBe("14.3");
  });

  it("without a print scale or descriptions: fits A4, places the descriptions and says so", () => {
    const { text, notes } = writePurplePen(SET, { scale: 10000 });
    expect(notes).toEqual([{ kind: "print-scale-chosen", scale: 4000 }, { kind: "descriptions-placed" }]);
    const area = elements(text, "print-area")[0]!;
    expect(area.getAttribute("automatic")).toBe("true");
    expect(area.getAttribute("page-landscape")).toBe("true");
    const desc = elements(text, "special-object").find((s) => s.getAttribute("kind") === "descriptions")!;
    // 6 mm on paper at 1:4000 is 2.4 mm on the map at 1:10 000; two cells right of 32, level with 31.
    const [corner, next] = locations(desc) as [number[], number[]];
    expect(corner[0]).toBeCloseTo(64.8, 6);
    expect(corner[1]).toBeCloseTo(40, 6);
    expect(next[0]! - corner[0]!).toBeCloseTo(2.4, 6);
    // A forest map: ISOM 2017, growing with the map.
    expect(elements(text, "course-appearance")[0]!.getAttribute("scale-sizes")).toBe("RelativeTo15000");
  });

  it("splits a forked course into its variations", () => {
    const forked: CourseSet = {
      ...SET,
      courses: [
        {
          id: "g",
          name: "Gafflad",
          order: "fixed",
          controls: ["S1", "31", "M1"],
          variations: [
            { code: "A", controls: ["S1", "31", "M1"] },
            { code: "B", controls: ["S1", "32", "M1"] },
          ],
        },
      ],
    };
    const { text, notes } = writePurplePen(forked, { scale: 10000, printScale: 10000 });
    expect(notes).toContainEqual({ kind: "forked-split", course: "Gafflad", variations: 2 });
    expect(readPurplePen(text, { parseXml }).courses.map((c) => c.name)).toEqual(["Gafflad A", "Gafflad B"]);
  });

  it("writes an OCAD file's specials, print area, print scale, descriptions and symbol sizes", () => {
    const b = new OcdFileBuilder(12)
      .addPointSymbol({ symNum: 702000, elements: [{ type: 3, color: 0, lineWidth: 35, diameter: 600, points: [[0, 0]] }] })
      .addLineSymbol({ symNum: 704000, lineColor: 0, lineWidth: 35 });
    b.addObject({ sym: 701000, otp: 1, coords: [[0, 0]], objectString: "00S1\tYs\taS1" });
    b.addObject({ sym: 702000, otp: 1, coords: [[3000, 4000]], objectString: "1031\tYc\ta31\td1.009\tg11.101" });
    b.addObject({ sym: 706000, otp: 1, coords: [[6000, 1000]], objectString: "30M1\tYf\taM1" });
    b.addObject({ sym: 709000, otp: 3, coords: [[0, 0], [1000, 0], [1000, 1000]] });
    b.addObject({ sym: 712000, otp: 1, coords: [[500, 500]], objectString: "Kort" });
    b.addObject({ sym: 720000, otp: 1, coords: [[7000, 5000]] });
    b.addObject({ sym: 723000, otp: 4, coords: [[2000, 2000], [2000, 1900], [4000, 1900], [4000, 2100], [2000, 2100]], text: "x" });
    b.addString(1026, "\ta7500.00\tL-10\tB-20\tR90\tT60");
    b.addString(1031, "\ts3.00");
    b.addString(1039, "\tm15000");
    b.addString(2, "Lång\tsS1\tc31\tfM1");
    b.addString(2, "Kort\tsS1\tfM1");
    const ocad = readOcadCourses(b.build());
    const { text, notes } = writePurplePen(ocad, { scale: 15000, layout: ocad });
    expect(notes).toEqual([]);
    const c31 = elements(text, "control").find((c) => c.getElementsByTagName("code")[0]?.textContent === "31")!;
    expect(
      Array.from(c31.getElementsByTagName("description")).map((d) => [d.getAttribute("box"), d.getAttribute("iof-2004-ref")]),
    ).toEqual([
      ["D", "1.9"],
      ["G", "11.1N"],
    ]);
    const specials = elements(text, "special-object");
    expect(specials.map((s) => s.getAttribute("kind"))).toEqual(["out-of-bounds", "first-aid", "descriptions", "text"]);
    // y upwards as in OCAD; the descriptions' second corner one cell (3 mm) to the right.
    expect(locations(specials[2]!)).toEqual([
      [70, 50],
      [73, 50],
    ]);
    expect(locations(specials[3]!)).toEqual([
      [20, 21],
      [40, 19],
    ]);
    expect(specials[3]!.getElementsByTagName("text")[0]!.textContent).toBe("$(EventTitle)");
    // First aid only on Kort, the second course.
    expect(specials[1]!.getElementsByTagName("course")[0]!.getAttribute("course")).toBe("2");
    const areas = elements(text, "print-area");
    expect(areas).toHaveLength(3);
    expect(["left", "top", "right", "bottom"].map((k) => areas[0]!.getAttribute(k))).toEqual(["-10", "60", "90", "-20"]);
    expect(elements(text, "options").every((o) => o.getAttribute("print-scale") === "7500")).toBe(true);
    // The file's own circle (6 mm) and line (0.35 mm) on the map, as in OCAD.
    const appearance = elements(text, "course-appearance")[0]!;
    expect(appearance.getAttribute("scale-sizes")).toBe("RelativeToMap");
    expect(appearance.getAttribute("control-circle-size-ratio")).toBe("1.2");
    expect(appearance.getAttribute("line-width-ratio")).toBeNull();
  });
});
