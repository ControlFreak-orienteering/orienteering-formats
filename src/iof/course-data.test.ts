import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isForkedCourse } from "../courses.js";
import { FormatError } from "../errors.js";
import { parseXml } from "../test-xml.js";
import { decodeXmlBytes } from "../xml.js";
import { looksLikeIofCourseData, readIofCourseData } from "./course-data.js";

const read = (xml: string) => readIofCourseData(xml, { parseXml });
const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return e instanceof FormatError ? e.code : "other";
  }
  return "none";
};

// A small hand-written file in the shapes the IOF standard and common exports use.
const IOF_30 = `<?xml version="1.0" encoding="UTF-8"?>
<CourseData xmlns="http://www.orienteering.org/datastandard/3.0" iofVersion="3.0">
  <Event><Name>Vårspringet</Name></Event>
  <RaceCourseData>
    <Map><Scale>10000</Scale></Map>
    <Control><Id>S1</Id><Position lat="59.4" lng="18.0"/><MapPosition x="10" y="20"/></Control>
    <Control><Id>31</Id><MapPosition x="30" y="40"/></Control>
    <Control><Id>32</Id><PunchingUnitId>32</PunchingUnitId><PunchingUnitId>132</PunchingUnitId></Control>
    <Control type="CrossingPoint"><Id>X1</Id></Control>
    <Control type="Finish"><Id>F1</Id></Control>
    <Course>
      <Name>Bana 1</Name>
      <Length>2400</Length>
      <Climb>60</Climb>
      <CourseControl type="Start"><Control>S1</Control></CourseControl>
      <CourseControl type="Control"><Control>31</Control></CourseControl>
      <CourseControl type="CrossingPoint"><Control>X1</Control></CourseControl>
      <CourseControl type="Control"><Control>32</Control></CourseControl>
      <CourseControl type="Finish"><Control>F1</Control></CourseControl>
    </Course>
    <Course>
      <Name>Poäng</Name>
      <CourseControl type="Start"><Control>S1</Control></CourseControl>
      <CourseControl type="Control"><Control>31</Control><Score>20</Score></CourseControl>
      <CourseControl type="Control"><Control>99</Control></CourseControl>
      <CourseControl type="Finish"><Control>F1</Control></CourseControl>
    </Course>
    <ClassCourseAssignment><ClassName>H21</ClassName><CourseName>Bana 1</CourseName></ClassCourseAssignment>
    <ClassCourseAssignment><ClassName>D21</ClassName><CourseName>Bana 1</CourseName></ClassCourseAssignment>
  </RaceCourseData>
</CourseData>`;

/** An IOF 2.0.3 file encoded as ISO-8859-1, as OCAD and others write them. */
function iof203Bytes(): Uint8Array {
  const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<CourseData>
  <IOFVersion version="2.0.3" />
  <Map><Scale> 15000 </Scale></Map>
  <StartPoint><StartPointCode> S1 </StartPointCode><MapPosition x="0" y="10"/></StartPoint>
  <Control><ControlCode> 40 </ControlCode><MapPosition x="5" y="20"/></Control>
  <Control><ControlCode> 46 </ControlCode></Control>
  <FinishPoint><FinishPointCode> M1 </FinishPointCode></FinishPoint>
  <Course>
    <CourseName> Bana Ö </CourseName>
    <CourseId> 7 </CourseId>
    <ClassShortName> D 21 </ClassShortName>
    <CourseVariation>
      <CourseVariationId> 0 </CourseVariationId>
      <CourseLength> 7600 </CourseLength>
      <CourseClimb> 120 </CourseClimb>
      <StartPointCode> S1 </StartPointCode>
      <CourseControl><Sequence> 2 </Sequence><ControlCode> 46 </ControlCode></CourseControl>
      <CourseControl><Sequence> 1 </Sequence><ControlCode> 40 </ControlCode></CourseControl>
      <FinishPointCode> M1 </FinishPointCode>
    </CourseVariation>
    <CourseVariation>
      <CourseVariationId> 1 </CourseVariationId>
      <CourseLength> 7500 </CourseLength>
      <StartPointCode> S1 </StartPointCode>
      <CourseControl><Sequence> 1 </Sequence><ControlCode> 46 </ControlCode></CourseControl>
      <FinishPointCode> M1 </FinishPointCode>
    </CourseVariation>
  </Course>
</CourseData>`;
  // Latin-1: one byte per character (the text is all within Latin-1).
  return Uint8Array.from(xml, (ch) => ch.charCodeAt(0));
}

describe("readIofCourseData, IOF XML 3.0", () => {
  const set = read(IOF_30);

  it("detects the version, the event and the map scale", () => {
    expect(set.version).toBe("3.0");
    expect(set.eventName).toBe("Vårspringet");
    expect(set.map).toEqual({ scale: 10000, metersPerUnit: 10 });
  });

  it("takes a point's kind from how courses use it when the control has no type", () => {
    const start = set.controls.find((c) => c.id === "S1");
    expect(start).toMatchObject({ kind: "start", codes: [], label: "S1", lat: 59.4, lng: 18 });
    expect(set.controls.find((c) => c.id === "X1")?.kind).toBe("crossing");
    expect(set.controls.find((c) => c.id === "31")).toMatchObject({ kind: "control", x: 30, y: 40 });
  });

  it("uses punching unit ids as codes, falling back to a numeric id", () => {
    expect(set.controls.find((c) => c.id === "31")?.codes).toEqual([31]);
    expect(set.controls.find((c) => c.id === "32")?.codes).toEqual([32, 132]);
  });

  it("reads courses with length, climb, order, scores and class assignments", () => {
    expect(set.courses[0]).toEqual({
      id: "Bana 1",
      name: "Bana 1",
      order: "fixed",
      controls: ["S1", "31", "X1", "32", "F1"],
      lengthMeters: 2400,
      climbMeters: 60,
      classNames: ["H21", "D21"],
    });
    expect(set.courses[1]).toMatchObject({ order: "free", scores: { "31": 20 } });
  });

  it("keeps a point a course refers to but the file does not define, without a position", () => {
    expect(set.controls.find((c) => c.id === "99")).toEqual({
      id: "99",
      kind: "control",
      codes: [99],
      x: 0,
      y: 0,
    });
  });
});

describe("readIofCourseData, a real-shaped 3.0 file with forks and positions", () => {
  const set = read(readFileSync(new URL("../../test/fixtures/courses/banor.xml", import.meta.url), "utf8"));

  it("reads positions on the earth and crossing points", () => {
    expect(set.controls.find((c) => c.id === "31")).toMatchObject({
      codes: [31],
      lat: 61.302086,
      lng: 17.0741101,
      x: 10,
      y: 20,
    });
    expect(set.controls.find((c) => c.id === "CROSS1")?.kind).toBe("crossing");
    expect(set.courses[0]).toMatchObject({
      name: "Kort",
      lengthMeters: 900,
      controls: ["S1", "31", "32", "CROSS1", "33", "F1"],
    });
  });

  it("marks the courses of a family as forked, and a lone family member as not", () => {
    const [kort, ab, ba, score] = set.courses;
    expect(ab?.family).toBe("Gafflad");
    expect(set.courses.map((c) => isForkedCourse(set, c))).toEqual([false, true, true, false]);
    expect(isForkedCourse({ ...set, courses: [kort!, ab!, score!] }, ab!)).toBe(false);
  });

  it("treats randomOrder on the course or a control as any order", () => {
    const original = readFileSync(new URL("../../test/fixtures/courses/banor.xml", import.meta.url), "utf8");
    const onCourse = read(original.replace("<Course>\n      <Name>Kort</Name>", '<Course randomOrder="true">\n      <Name>Kort</Name>'));
    expect(onCourse.courses[0]!.order).toBe("free");
    expect(onCourse.courses[0]!.scores).toBeUndefined();
    const onControl = read(
      original.replace(
        '<CourseControl type="Control"><Control>31</Control></CourseControl>',
        '<CourseControl type="Control" randomOrder="true"><Control>31</Control></CourseControl>',
      ),
    );
    expect(onControl.courses[0]!.order).toBe("free");
  });
});

describe("readIofCourseData, IOF XML 2.0.3", () => {
  const set = read(decodeXmlBytes(iof203Bytes()));

  it("decodes ISO-8859-1 and detects the version", () => {
    expect(set.version).toBe("2.0.3");
    expect(set.courses[0]!.name).toBe("Bana Ö");
    expect(set.map).toEqual({ scale: 15000, metersPerUnit: 15 });
  });

  it("orders controls by sequence and wraps them in start and finish", () => {
    expect(set.courses[0]).toMatchObject({
      id: "7",
      controls: ["start:S1", "control:40", "control:46", "finish:M1"],
      lengthMeters: 7600,
      climbMeters: 120,
      classNames: ["D 21"],
    });
  });

  it("reads several variations as forking", () => {
    expect(set.courses[0]!.variations?.map((v) => v.lengthMeters)).toEqual([7600, 7500]);
    expect(isForkedCourse(set, set.courses[0]!)).toBe(true);
  });

  it("flips y, since 2.0.3 exports count it upwards", () => {
    expect(set.controls.find((c) => c.id === "start:S1")).toMatchObject({ label: "S1", y: -10 });
    expect(set.controls.find((c) => c.id === "control:40")?.codes).toEqual([40]);
  });
});

describe("recognising and refusing files", () => {
  it("accepts CourseData with or without a namespace prefix, and rejects others", () => {
    expect(looksLikeIofCourseData(IOF_30)).toBe(true);
    expect(looksLikeIofCourseData('<iof:CourseData xmlns:iof="x">')).toBe(true);
    expect(looksLikeIofCourseData("<EntryList/>")).toBe(false);
  });

  it("explains broken, wrong and empty files by code", () => {
    expect(codeOf(() => read("<CourseData><broken"))).toBe("unreadable");
    expect(codeOf(() => read("<ResultList/>"))).toBe("wrong-format");
    expect(codeOf(() => read("<CourseData><RaceCourseData/></CourseData>"))).toBe("empty");
    expect(codeOf(() => read('<CourseData><IOFVersion version="2.0.3"/></CourseData>'))).toBe("empty");
  });
});
