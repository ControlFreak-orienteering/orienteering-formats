import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isForkedCourse } from "../courses.js";
import { FormatError } from "../errors.js";
import { parseXml } from "../test-xml.js";
import { looksLikePurplePen, readPurplePen } from "./purple-pen.js";

const read = (xml: string) => readPurplePen(xml, { parseXml });

// A small hand-written file in the shape Purple Pen writes. Map scale 1:10 000, so 1 mm
// on the map is 10 m on the ground.
const PPEN = `<?xml version="1.0" encoding="utf-8"?>
<course-scribe-event>
  <event id="1">
    <title>Vårspringet</title>
    <map kind="OCAD" scale="10000" absolute-path="C:\\Kartor\\karta.ocd">..\\Kartor\\karta.ocd</map>
  </event>
  <control id="1" kind="start"><location x="0" y="0" /></control>
  <control id="2" kind="normal"><code>31</code><location x="30" y="40" /></control>
  <control id="3" kind="crossing-point"><location x="30" y="20" /></control>
  <control id="4" kind="finish"><location x="30" y="0" /></control>
  <control id="5" kind="map-issue"><location x="-5" y="0" /></control>
  <control id="6" kind="normal"><code>32</code><location x="10" y="10" /></control>
  <course id="1" kind="normal" order="1">
    <name>Bana 1</name>
    <first course-control="1" />
    <options print-scale="10000" climb="25" />
  </course>
  <course id="2" kind="score" order="2">
    <name>Poäng</name>
    <first course-control="10" />
    <options print-scale="10000" climb="-1" course-length="1500" />
  </course>
  <course id="3" kind="normal" order="3">
    <name>Gafflad</name>
    <first course-control="20" />
    <options print-scale="10000" />
  </course>
  <course-control id="1" control="1"><next course-control="2" /></course-control>
  <course-control id="2" control="2"><next course-control="3" /></course-control>
  <course-control id="3" control="3"><next course-control="4" /></course-control>
  <course-control id="4" control="4" />
  <course-control id="10" control="1"><next course-control="11" /></course-control>
  <course-control id="11" control="2" points="20"><next course-control="12" /></course-control>
  <course-control id="12" control="4" />
  <course-control id="20" control="1"><next course-control="21" /></course-control>
  <course-control id="21" control="2" variation="fork" variation-end="23">
    <next course-control="23" />
    <variation course-control="21" />
    <variation course-control="22" />
  </course-control>
  <course-control id="22" control="6" variation="fork" variation-end="23">
    <next course-control="23" />
  </course-control>
  <course-control id="23" control="4" />
</course-scribe-event>`;

describe("readPurplePen", () => {
  const set = read(PPEN);

  it("reads title, map, scale and the points, skipping map issue points", () => {
    expect(set.title).toBe("Vårspringet");
    expect(set.mapFileName).toBe("karta.ocd");
    expect(set.map).toEqual({ scale: 10000, metersPerUnit: 10 });
    expect(set.controls.map((c) => c.kind)).toEqual(["start", "control", "crossing", "finish", "control"]);
    // Purple Pen counts y upwards; the exchange rule is y downwards.
    expect(set.controls.find((c) => c.id === "2")).toEqual({ id: "2", kind: "control", codes: [31], x: 30, y: -40 });
    expect(set.controls[0]).toMatchObject({ kind: "start", label: "S", codes: [] });
  });

  it("follows the course from start to finish and computes the length", () => {
    expect(set.courses[0]).toEqual({
      id: "1",
      name: "Bana 1",
      order: "fixed",
      controls: ["1", "2", "3", "4"],
      // Legs of 50 + 20 + 20 mm = 90 mm, which is 900 m at 1:10 000.
      lengthMeters: 900,
      climbMeters: 25,
    });
  });

  it("marks score courses with their points and uses a typed-in length; climb -1 means none", () => {
    expect(set.courses[1]).toEqual({
      id: "2",
      name: "Poäng",
      order: "free",
      controls: ["1", "2", "4"],
      lengthMeters: 1500,
      scores: { "2": 20 },
    });
  });

  it("reads forked courses along the first variation and says so", () => {
    expect(set.courses[2]).toMatchObject({ controls: ["1", "2", "4"], partlyRead: true });
    expect(set.courses.map((c) => isForkedCourse(set, c))).toEqual([false, false, true]);
  });

  it("stops at a chain that loops instead of hanging", () => {
    const looped = read(
      PPEN.replace('<course-control id="4" control="4" />', '<course-control id="4" control="4"><next course-control="1" /></course-control>'),
    );
    expect(looped.courses[0]!.controls).toEqual(["1", "2", "3", "4"]);
  });

  it("reads the fixture shared with the apps, courses in their order", () => {
    const fixture = read(readFileSync(new URL("../../test/fixtures/courses/bana.ppen", import.meta.url), "utf8"));
    expect(fixture.mapFileName).toBe("karta.omap");
    expect(fixture.courses.map((c) => [c.name, c.order, isForkedCourse(fixture, c)])).toEqual([
      ["Kort", "fixed", false],
      ["Gafflad", "fixed", true],
      ["Poäng", "free", false],
    ]);
    expect(fixture.courses[2]!.scores).toEqual({ "2": 10, "3": 20 });
  });

  it("recognises Purple Pen files and refuses others by code", () => {
    expect(looksLikePurplePen(PPEN)).toBe(true);
    expect(looksLikePurplePen("<CourseData/>")).toBe(false);
    const codeOf = (xml: string) => {
      try {
        read(xml);
      } catch (e) {
        return e instanceof FormatError ? e.code : "other";
      }
      return "none";
    };
    expect(codeOf("<other/>")).toBe("wrong-format");
    expect(codeOf("<course-scribe-event/>")).toBe("empty");
    expect(codeOf("<course-scribe-event><broken")).toBe("unreadable");
  });

  it("reads a file of start points only when asked, with the starts' names", () => {
    const starts = `<?xml version="1.0" encoding="utf-8"?>
<course-scribe-event>
  <event id="1"><title>Watopia</title><map kind="OCAD" scale="4000">watopia.omap</map></event>
  <control id="1" kind="start"><code>Volcano Circuit</code><location x="10" y="-20" /></control>
  <control id="2" kind="start"><location x="30" y="40" /></control>
</course-scribe-event>`;
    expect(() => read(starts)).toThrow(FormatError);
    const set = readPurplePen(starts, { parseXml, allowNoCourses: true });
    expect(set.courses).toEqual([]);
    expect(set.controls.map((c) => [c.kind, c.label, c.x, c.y])).toEqual([
      ["start", "Volcano Circuit", 10, 20],
      ["start", "S", 30, -40],
    ]);
  });
});
