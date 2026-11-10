import { describe, expect, it } from "vitest";

import { FormatError } from "../errors.js";
import { mapToWgs84 } from "../map/georeference.js";
import { OcdFileBuilder, type OcdVersion } from "../map/testing/ocd-builder.js";
import { looksLikeOcad, readOcadCourses } from "./courses.js";

const START = 701000;
const CONTROL = 702000;
const FINISH = 706000;

/** A point object at x, y millimetres (y upwards, as OCAD counts). */
const point = (sym: number, x: number, y: number, objectString?: string) => ({
  sym,
  otp: 1 as const,
  coords: [[x * 100, y * 100] as [number, number]],
  ...(objectString ? { objectString } : {}),
});

/**
 * A course file the way the given OCAD version writes it: start S1 at (0, 0), 31 at
 * (30, 40), 32 at (60, 0) and finish M1 at (60, 10), on a 1:10 000 map in SWEREF 99 TM.
 */
function courseFile(version: OcdVersion, courses: string[]): ArrayBuffer {
  const b = new OcdFileBuilder(version);
  const controls: [number, number, number, string, string][] = [
    [START, 0, 0, "S1", "s"],
    [CONTROL, 30, 40, "31", "c"],
    [CONTROL, 60, 0, "32", "c"],
    [FINISH, 60, 10, "M1", "f"],
  ];
  controls.forEach(([sym, x, y, code, kind], i) => {
    if (version >= 12) {
      // OCAD 12 writes the control as the object's own string, with the code in `a`.
      b.addObject(point(sym, x, y, `10${code}\tY${kind}\ta${code}`));
    } else {
      b.addObject(point(sym, x, y));
      b.addString(1, `${code}\tY${kind}\td2.001`, i + 1);
    }
  });
  // A connection line, which is not a control.
  b.addObject({ sym: 704000, otp: 2, coords: [[0, 0], [3000, 4000]] });
  b.addString(8, "C:\\Kartor\\Skogen.ocd\ts1\tr1");
  b.addString(1039, "\tm10000\tx600000\ty6700000\ta0\tr1\ti13002");
  for (const c of courses) b.addString(2, c);
  return b.build();
}

describe("readOcadCourses", () => {
  for (const version of [10, 11, 12, 2018] as const) {
    it(`reads controls and courses from OCAD ${version}`, () => {
      const set = readOcadCourses(courseFile(version, ["Lång\tsS1\tc31\tc32\tfM1"]));
      expect(set.backgroundMaps).toEqual(["Skogen.ocd"]);
      expect(set.courses).toEqual([
        { id: "Lång", name: "Lång", order: "fixed", controls: ["S1", "31", "32", "M1"], lengthMeters: 1100 },
      ]);
      // Millimetres with y downwards.
      expect(set.controls).toEqual([
        { id: "S1", kind: "start", codes: [], label: "S1", x: 0, y: -0 },
        { id: "31", kind: "control", codes: [31], x: 30, y: -40 },
        { id: "32", kind: "control", codes: [32], x: 60, y: -0 },
        { id: "M1", kind: "finish", codes: [], label: "M1", x: 60, y: -10 },
      ]);
      expect(set.map?.scale).toBe(10000);
      expect(set.map?.metersPerUnit).toBe(10);
    });
  }

  it("places the controls on the earth with the file's own georeference", () => {
    const set = readOcadCourses(courseFile(11, ["Lång\tsS1\tc31\tc32\tfM1"]));
    const georef = set.map!.georeference!;
    expect(georef.easting).toBe(600000);
    expect(georef.northing).toBe(6700000);
    const c31 = set.controls.find((c) => c.id === "31")!;
    // 31 is 300 m east and 400 m north of the map's origin.
    const expected = mapToWgs84(georef, 300, 400);
    expect(mapToWgs84(georef, c31.x * 10, -c31.y * 10)).toEqual(expected);
  });

  it("gives a course that ends at its start a finish there", () => {
    const set = readOcadCourses(courseFile(11, ["Slinga\tsS1\tc31\tc32\tsS1"]));
    expect(set.courses[0]!.controls).toEqual(["S1", "31", "32", "finish:S1"]);
    expect(set.controls.find((c) => c.id === "finish:S1")).toEqual({
      id: "finish:S1",
      kind: "finish",
      codes: [],
      label: "S1",
      x: 0,
      y: -0,
    });
  });

  it("skips parts it does not know and points the file lacks", () => {
    const set = readOcadCourses(courseFile(12, ["Kort\tsS1\tc31\tc99\tx5\tfM1"]));
    expect(set.courses[0]!.controls).toEqual(["S1", "31", "M1"]);
    // Points no course uses are left out.
    expect(set.controls.map((c) => c.id)).toEqual(["S1", "31", "M1"]);
  });

  it("keeps courses that share a name apart", () => {
    const set = readOcadCourses(courseFile(11, ["A\tsS1\tc31\tfM1", "A\tsS1\tc32\tfM1"]));
    expect(set.courses.map((c) => c.id)).toEqual(["A", "A*"]);
  });

  it("reads the other course-setting objects, the print window and the description cell", () => {
    const b = new OcdFileBuilder(12);
    b.addObject(point(START, 0, 0, "10S1\tYs\taS1"));
    b.addObject(point(CONTROL, 30, 40, "1031\tYc\ta31"));
    b.addObject(point(FINISH, 60, 10, "30M1\tYf\taM1"));
    // An out-of-bounds area, a first aid point only on "Kort", and the descriptions.
    b.addObject({ sym: 709000, otp: 3, coords: [[0, 0], [1000, 0], [1000, 1000]] });
    b.addObject(point(712000, 5, 5, "Kort"));
    b.addObject(point(720000, 70, 50));
    // The event's name, which OCAD fills in, and a text of the course setter's own.
    b.addObject({ sym: 723000, otp: 4, coords: [[2000, 2000], [2000, 1900], [4000, 1900], [4000, 2100], [2000, 2100]], text: "Natt-DM" });
    b.addObject({ sym: 799000, otp: 4, coords: [[0, 5000]], text: "Parkering" });
    // Generated by OCAD for a course: left out.
    b.addObject({ sym: 703000, otp: 4, coords: [[0, 0]], text: "1", status: 2 });
    // A symbol this reader does not know, and a known one of the wrong type.
    b.addObject(point(714000, 1, 1));
    b.addObject({ sym: 712000, otp: 2, coords: [[0, 0], [100, 100]] });
    b.addString(1026, "\ta7500.00\tl1\tL-10\tB-20\tR90\tT60");
    b.addString(1031, "\tt0\ts3.00");
    b.addString(1039, "\tm10000");
    b.addString(2, "Lång\tsS1\tc31\tfM1");
    b.addString(2, "Kort\tsS1\tfM1");
    const set = readOcadCourses(b.build());
    expect(set.printScale).toBe(7500);
    expect(set.printArea).toEqual({ left: -10, top: -60, right: 90, bottom: 20 });
    expect(set.descriptionCellMm).toBe(3);
    expect(set.specials).toEqual([
      { kind: "out-of-bounds", points: [{ x: 0, y: -0 }, { x: 10, y: -0 }, { x: 10, y: -10 }] },
      { kind: "first-aid", points: [{ x: 5, y: -5 }], courses: ["Kort"] },
      { kind: "descriptions", points: [{ x: 70, y: -50 }] },
      {
        kind: "text",
        field: "event-name",
        points: [{ x: 20, y: -20 }, { x: 20, y: -19 }, { x: 40, y: -19 }, { x: 40, y: -21 }, { x: 20, y: -21 }],
      },
      { kind: "text", text: "Parkering", points: [{ x: 0, y: -50 }] },
    ]);
  });

  for (const version of [11, 12] as const) {
    it(`reads the control circle's and course line's sizes (OCAD ${version})`, () => {
      const b = new OcdFileBuilder(version)
        .addPointSymbol({
          symNum: 702000,
          elements: [{ type: 3, color: 0, lineWidth: 35, diameter: 600, points: [[0, 0]] }],
        })
        .addLineSymbol({ symNum: 704000, lineColor: 0, lineWidth: 35 });
      b.addObject(point(START, 0, 0));
      b.addString(1, "S1\tYs", 1);
      b.addString(2, "A\tsS1");
      expect(readOcadCourses(b.build()).courseSymbols).toEqual({ controlDiameterMm: 6, lineWidthMm: 0.35 });
    });
  }

  it("refuses a map without courses as empty", () => {
    const b = new OcdFileBuilder(11).addScale(10000);
    b.addObject(point(CONTROL, 0, 0));
    expect(() => readOcadCourses(b.build())).toThrow(new FormatError("empty"));
  });

  it("refuses what is not an OCAD file", () => {
    expect(looksLikeOcad(new TextEncoder().encode("<xml/>"))).toBe(false);
    expect(() => readOcadCourses(new TextEncoder().encode("<xml/>"))).toThrow(
      new FormatError("wrong-format"),
    );
  });

  it("refuses a file cut short as unreadable or empty, never throwing anything else", () => {
    const whole = new Uint8Array(courseFile(11, ["Lång\tsS1\tc31\tfM1"]));
    for (const length of [10, 100, 2000, whole.length - 50]) {
      try {
        readOcadCourses(whole.slice(0, length));
      } catch (e) {
        expect(e).toBeInstanceOf(FormatError);
      }
    }
  });
});
