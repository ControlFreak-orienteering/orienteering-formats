import { describe, expect, it } from "vitest";

import { FormatError } from "../errors.js";
import { parseXml } from "../test-xml.js";
import { writeIofResultList, type ResultList } from "./write-result-list.js";

const NS = "http://www.orienteering.org/datastandard/3.0";

/** Results as Live has them: a course with splits and a score course, one runner still out. */
const LIST: ResultList = {
  event: { name: "Veckans bana & co", date: "2026-10-29", endDate: "2026-11-01", organiser: "Strängnäs OK" },
  complete: false,
  classes: [
    {
      name: "Lång",
      course: { name: "Lång", lengthMeters: 4100.4, numberOfControls: 2 },
      results: [
        {
          name: "Elin Berg",
          club: "Mossens IF",
          status: "OK",
          position: 1,
          time: 1512,
          timeBehind: 0,
          startTime: Date.UTC(2026, 9, 29, 17, 0, 0),
          finishTime: Date.UTC(2026, 9, 29, 17, 25, 12),
          splits: [
            { controlCode: "31", time: 245 },
            { controlCode: "32", time: 801.25 },
          ],
          card: 8123456,
        },
        {
          name: "Jan de <Vries>",
          status: "MissingPunch",
          time: 1700,
          splits: [{ controlCode: "31", time: 300 }, { controlCode: "32" }],
        },
        { name: "Viktor Ek", club: 'OK "Citat"', status: "Active", splits: [{ controlCode: "31" }] },
      ],
    },
    { name: "Tom", results: [] },
    {
      name: "Poäng",
      results: [{ name: "Anton Kärr", status: "OK", position: 1, time: 1827, score: 298, penalty: 2 }],
    },
  ],
};

const write = (list: ResultList = LIST) =>
  writeIofResultList(list, {
    creator: "Test",
    createTime: "2026-11-03T12:00:00.000Z",
    timeZone: "Europe/Stockholm",
  });

const all = (node: Document | Element, name: string) => [...node.getElementsByTagNameNS(NS, name)];
const value = (node: Element, name: string) => all(node, name)[0]?.textContent ?? null;

describe("writeIofResultList", () => {
  it("writes a 3.0 ResultList with the event, its days and its organiser", () => {
    const xml = write();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<ResultList xmlns="' + NS)).toBe(true);
    expect(xml).toContain('iofVersion="3.0" createTime="2026-11-03T12:00:00.000Z" creator="Test" status="Snapshot"');
    const doc = parseXml(xml);
    const event = all(doc, "Event")[0]!;
    expect(value(event, "Name")).toBe("Veckans bana & co");
    expect(value(all(event, "StartTime")[0]!, "Date")).toBe("2026-10-29");
    expect(value(all(event, "EndTime")[0]!, "Date")).toBe("2026-11-01");
    expect(value(all(event, "Organiser")[0]!, "Name")).toBe("Strängnäs OK");
    expect(write({ ...LIST, complete: true })).toContain('status="Complete"');
  });

  it("writes each class with its course and runners in order, and leaves out empty classes", () => {
    const doc = parseXml(write());
    const classes = all(doc, "ClassResult");
    expect(classes.map((c) => value(all(c, "Class")[0]!, "Name"))).toEqual(["Lång", "Poäng"]);
    const course = all(classes[0]!, "Course")[0]!;
    expect([value(course, "Name"), value(course, "Length"), value(course, "NumberOfControls")]).toEqual([
      "Lång",
      "4100",
      "2",
    ]);
    const people = all(classes[0]!, "PersonResult");
    expect(people.map((p) => value(p, "Family"))).toEqual(["Berg", "<Vries>", "Ek"]);
    expect(people.map((p) => value(p, "Given"))).toEqual(["Elin", "Jan de", "Viktor"]);
    expect(value(all(people[2]!, "Organisation")[0]!, "Name")).toBe('OK "Citat"');
  });

  it("writes times, place, status, splits and card, with start and finish in the zone", () => {
    const [first, second, out] = all(parseXml(write()), "Result");
    expect(value(first!, "StartTime")).toBe("2026-10-29T18:00:00+01:00");
    expect(value(first!, "FinishTime")).toBe("2026-10-29T18:25:12+01:00");
    expect([value(first!, "Time"), value(first!, "TimeBehind"), value(first!, "Position")]).toEqual([
      "1512",
      "0",
      "1",
    ]);
    expect(value(first!, "Status")).toBe("OK");
    expect(value(first!, "ControlCard")).toBe("8123456");
    const splits = (r: Element) =>
      all(r, "SplitTime").map((s) => [value(s, "ControlCode"), value(s, "Time"), s.getAttribute("status")]);
    expect(splits(first!)).toEqual([
      ["31", "245", null],
      ["32", "801.3", null],
    ]);
    expect(splits(second!)).toEqual([
      ["31", "300", null],
      ["32", null, "Missing"],
    ]);
    expect(value(second!, "Position")).toBe(null);
    expect(value(out!, "Status")).toBe("Active");
    expect(value(out!, "Time")).toBe(null);
  });

  it("writes the points and the penalty on a score course", () => {
    const score = all(all(parseXml(write()), "Result")[3]!, "Score");
    expect(score.map((s) => [s.getAttribute("type"), s.textContent])).toEqual([
      ["Score", "298"],
      ["Penalty", "2"],
    ]);
  });

  it("writes times in UTC without a time zone", () => {
    const xml = writeIofResultList(LIST, { createTime: "x" });
    expect(xml).toContain("<StartTime>2026-10-29T17:00:00Z</StartTime>");
    expect(xml).toContain('creator="orienteering-formats"');
  });

  it("refuses results without a runner and unreadable dates", () => {
    const empty = () => writeIofResultList({ ...LIST, classes: [{ name: "Tom", results: [] }] });
    expect(empty).toThrow(FormatError);
    expect(empty).toThrow(expect.objectContaining({ code: "empty" }));
    expect(() => writeIofResultList({ ...LIST, event: { name: "X", date: "29 okt" } })).toThrow(
      expect.objectContaining({ code: "unreadable" }),
    );
  });
});
