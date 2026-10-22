import { describe, expect, it } from "vitest";

import type { CourseSet } from "../courses.js";
import { FormatError } from "../errors.js";
import { parseXml } from "../test-xml.js";
import { readIofCourseData } from "./course-data.js";
import { writeIofCourseData } from "./write-course-data.js";

const read = (xml: string) => readIofCourseData(xml, { parseXml });
const countOf = (xml: string, tag: string) => xml.split(`<${tag}`).length - 1;

/** A set as ControlFreak builds one for the file: ids are the codes, units millimetres. */
const SET: CourseSet = {
  map: { scale: 10000, metersPerUnit: 10 },
  controls: [
    { id: "S1", kind: "start", codes: [], label: "S1", x: 10, y: -20, lat: 59.4, lng: 18.0 },
    { id: "31", kind: "control", codes: [31], x: 40, y: -60, lat: 59.41, lng: 18.01 },
    { id: "32", kind: "control", codes: [32], x: 80, y: -60 },
    { id: "CROSS1", kind: "crossing", codes: [], x: 60, y: -40 },
    { id: "M1", kind: "finish", codes: [], label: "M1", x: 100, y: -20 },
  ],
  courses: [
    {
      id: "1",
      name: "Lång",
      order: "fixed",
      controls: ["S1", "31", "CROSS1", "32", "M1"],
      climbMeters: 45,
      classNames: ["H21", "D21"],
      tapedRoutes: [{ to: 1, kind: "all" }, { to: 4, kind: "funnel" }],
    },
    { id: "2", name: "Kort", order: "fixed", controls: ["S1", "32", "M1"], lengthMeters: 1234 },
    { id: "3", name: "Tom", order: "fixed", controls: [] },
    {
      id: "4",
      name: "Poäng",
      order: "free",
      controls: ["S1", "31", "32", "M1"],
      scores: { "31": 10, "32": 20 },
    },
  ],
};

describe("writeIofCourseData", () => {
  const xml = writeIofCourseData(SET, {
    eventName: "Vårspringet",
    creator: "Test",
    createTime: "2026-10-20T10:00:00.000Z",
    mapCorners: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 200, y: 300 } },
  });

  it("writes every point once and one Course per course with points", () => {
    // Five points, then the courses' references to them.
    expect(xml.match(/<Control(?: type="\w+")?>\n/g)?.length).toBe(5);
    expect(xml.match(/<Control>[^<]*<\/Control>/g)?.length).toBe(5 + 3 + 4);
    expect(countOf(xml, "Course>")).toBe(3);
    expect(xml).not.toContain("<Name>Tom</Name>");
  });

  it("puts Position before MapPosition, with y flipped to the map's grid", () => {
    expect(xml).toContain(
      '<Position lng="18.0000000" lat="59.4000000"/>\n      <MapPosition unit="mm" x="10.00" y="20.00"/>',
    );
    expect(xml).toContain('<Id>32</Id>\n      <PunchingUnitId>32</PunchingUnitId>\n      <MapPosition');
  });

  it("writes the scale and the sheet's corners", () => {
    expect(xml).toContain("<Scale>10000</Scale>");
    expect(xml).toContain('<MapPositionBottomRight unit="mm" x="200.00" y="-300.00"/>');
  });

  it("computes lengths at the file's scale and keeps a stated length", () => {
    // S1 (10,20) → 31 (40,60): 50 mm; → CROSS1 (60,40): 28.3; → 32 (80,60): 28.3; → M1 (100,20): 44.7
    expect(xml).toContain("<Name>Lång</Name>\n      <Length>1513</Length>\n      <Climb>45</Climb>");
    expect(xml).toContain("<Name>Kort</Name>\n      <Length>1234</Length>");
    expect(xml).toContain("<LegLength>500</LegLength>");
    // A score course has no order, so no leg lengths and no length.
    expect(xml).toContain("<Name>Poäng</Name>\n      <NumberOfControls>2</NumberOfControls>");
  });

  it("writes special instructions, scores and class assignments", () => {
    expect(xml).toContain('<CourseControl type="Control" specialInstruction="TapedRoute">\n        <Control>31</Control>');
    expect(xml).toContain('<CourseControl type="CrossingPoint" specialInstruction="MandatoryCrossingPoint">');
    expect(xml).toContain('<CourseControl type="Finish" specialInstruction="FunnelTapedRoute">');
    expect(xml).toContain("<Control>31</Control>\n        <Score>10</Score>");
    expect(xml).toContain("<ClassName>D21</ClassName>\n      <CourseName>Lång</CourseName>");
  });

  it("reads back the same", () => {
    const back = read(xml);
    expect(back.eventName).toBe("Vårspringet");
    expect(back.map).toEqual({ scale: 10000, metersPerUnit: 10 });
    expect(back.controls.find((c) => c.id === "31")).toMatchObject({ x: 40, y: -60, lat: 59.41, lng: 18.01, codes: [31] });
    expect(back.controls.find((c) => c.id === "CROSS1")?.kind).toBe("crossing");
    expect(back.courses.map((c) => c.name)).toEqual(["Lång", "Kort", "Poäng"]);
    expect(back.courses[0]).toMatchObject({
      controls: ["S1", "31", "CROSS1", "32", "M1"],
      lengthMeters: 1513,
      climbMeters: 45,
      classNames: ["H21", "D21"],
      tapedRoutes: [{ to: 1, kind: "all" }, { to: 4, kind: "funnel" }],
    });
    expect(back.courses[2]).toMatchObject({ order: "free", scores: { "31": 10, "32": 20 } });
    expect(back.unpositioned).toEqual([]);
  });

  it("converts a set in map units to millimetres at the scale", () => {
    // 1 unit = 0.5 m on the ground at 1:10 000 = 0.05 mm on the sheet.
    const units: CourseSet = {
      map: { scale: 10000, metersPerUnit: 0.5 },
      controls: [
        { id: "S1", kind: "start", codes: [], x: 200, y: 400 },
        { id: "31", kind: "control", codes: [31], x: 2200, y: 400 },
      ],
      courses: [{ id: "1", name: "A", order: "fixed", controls: ["S1", "31"] }],
    };
    const out = writeIofCourseData(units);
    expect(out).toContain('<MapPosition unit="mm" x="10.00" y="-20.00"/>');
    expect(out).toContain("<Length>1000</Length>");
  });

  it("writes a forked course as one course per variation in a family", () => {
    const forked: CourseSet = {
      controls: SET.controls,
      courses: [
        {
          id: "1",
          name: "Gafflad",
          order: "fixed",
          controls: ["S1", "31", "M1"],
          variations: [
            { code: "A", controls: ["S1", "31", "M1"], lengthMeters: 900 },
            { code: "B", controls: ["S1", "32", "M1"] },
          ],
        },
      ],
    };
    const out = writeIofCourseData(forked);
    expect(out).toContain("<Name>Gafflad A</Name>\n      <CourseFamily>Gafflad</CourseFamily>\n      <Length>900</Length>");
    expect(out).toContain("<Name>Gafflad B</Name>\n      <CourseFamily>Gafflad</CourseFamily>\n      <NumberOfControls>1</NumberOfControls>");
    // Without a scale the units are millimetres, but lengths cannot be computed.
    expect(out).not.toContain("<Scale>");
    expect(out).not.toContain("<LegLength>");
  });

  it("writes the teams' courses in the schema's order and reads them back", () => {
    const teamCourses: CourseSet["teamCourses"] = [
      {
        bib: "1",
        teamName: "OK Ravinen & co",
        className: "H21",
        members: [
          { leg: 1, memberName: "Anna Berg", courseName: "Lång A", courseFamily: "Lång" },
          { leg: 2, legOrder: 2, bib: "1-2", courseName: "Lång B", courseFamily: "Lång" },
        ],
      },
      { teamName: "Utan löpare", members: [] },
    ];
    const out = writeIofCourseData({ ...SET, teamCourses });
    expect(countOf(out, "TeamCourseAssignment>")).toBe(1);
    expect(out).toContain("<TeamName>OK Ravinen &amp; co</TeamName>");
    expect(out).toContain(
      "<BibNumber>1-2</BibNumber>\n        <Leg>2</Leg>\n        <LegOrder>2</LegOrder>\n        <CourseName>Lång B</CourseName>\n        <CourseFamily>Lång</CourseFamily>",
    );
    // After the class assignments, as the schema wants.
    expect(out.indexOf("<TeamCourseAssignment>")).toBeGreaterThan(
      out.lastIndexOf("</ClassCourseAssignment>"),
    );
    expect(read(out).teamCourses).toEqual([teamCourses[0]]);
  });

  it("refuses a set with nothing to write", () => {
    try {
      writeIofCourseData({ controls: SET.controls, courses: [SET.courses[2]!] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(FormatError);
      expect((e as FormatError).code).toBe("empty");
    }
  });

  it("escapes the text it writes", () => {
    const out = writeIofCourseData(
      { controls: SET.controls, courses: [{ id: "1", name: "A & B <C>", order: "fixed", controls: ["S1"] }] },
      { eventName: 'Tävling "2026"' },
    );
    expect(out).toContain("<Name>Tävling &quot;2026&quot;</Name>");
    expect(out).toContain("<Name>A &amp; B &lt;C&gt;</Name>");
  });
});
