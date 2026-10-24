import { describe, expect, it } from "vitest";

import { FormatError } from "../errors.js";
import type { StartList } from "../start-list.js";
import { parseXml } from "../test-xml.js";
import { readIofStartList } from "./start-list.js";
import { splitRunnerName, writeIofStartList } from "./write-start-list.js";

const read = (xml: string) => readIofStartList(xml, { parseXml });

/** A list as the start clock holds one: classes mixed, some fields missing. */
const LIST: StartList = {
  createdAt: "2026-05-01T08:00:00.000Z",
  competition: { name: "Vårtävling & co", date: "2026-05-02" },
  runners: [
    { time: "10:00:00", name: "Anna Lindberg", club: "Tyrso IF", class: "D21", card: 8123456, start: "S1" },
    { time: "10:00:00", name: "Erik Johansson", club: "Kringla TR", class: "H21", course: "Bana 1" },
    { time: "10:01:00", name: "Karin Svensson", club: "Gävle OK", class: "D21", start: "S1" },
    { time: "10:02:00", name: "Vakant", class: "H21", course: "Bana 1" },
    { time: "10:03:00", name: "Jan de <Vries>", club: 'OK "Citat"' },
  ],
};

describe("writeIofStartList", () => {
  it("writes a 3.0 file that reads back the same, classes in order of first runner", () => {
    const xml = writeIofStartList(LIST, { creator: "Test", utcOffsetMinutes: 120 });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<StartList xmlns="http://www.orienteering.org/datastandard/3.0"')).toBe(true);
    expect(xml).toContain('iofVersion="3.0" createTime="2026-05-01T08:00:00.000Z" creator="Test"');
    expect(xml).toContain("<Name>Vårtävling &amp; co</Name>");
    expect(xml).toContain("<StartTime>2026-05-02T10:00:00+02:00</StartTime>");
    expect(xml).toContain("<ControlCard>8123456</ControlCard>");
    expect(xml).toContain("<Family>Lindberg</Family>\n          <Given>Anna</Given>");
    expect(xml).toContain("<Family>&lt;Vries&gt;</Family>\n          <Given>Jan de</Given>");
    expect(xml).toContain("<Name>OK &quot;Citat&quot;</Name>");
    // Class order: D21, H21, then the runners without a class.
    expect(xml.indexOf("<Name>D21</Name>")).toBeLessThan(xml.indexOf("<Name>H21</Name>"));
    expect(xml.indexOf("<Name>H21</Name>")).toBeLessThan(xml.indexOf("<Name></Name>"));
    // Course and start name at class level when every runner in the class shares them.
    expect(xml).toContain("<StartName>S1</StartName>");
    expect(xml).toContain("<Course>\n      <Name>Bana 1</Name>\n    </Course>");

    const back = read(xml);
    expect(back.version).toBe("3.0");
    expect(back.createdAt).toBe("2026-05-01T08:00:00.000Z");
    expect(back.competition).toEqual({ name: "Vårtävling & co", date: "2026-05-02" });
    expect(back.runners).toEqual([
      LIST.runners[0],
      LIST.runners[2],
      { time: "10:00:00", name: "Erik Johansson", club: "Kringla TR", class: "H21" },
      { time: "10:02:00", name: "Vakant", class: "H21" },
      { time: "10:03:00", name: "Jan de <Vries>", club: 'OK "Citat"' },
    ]);
  });

  it("leaves out a course or start name the runners of a class do not share", () => {
    const xml = writeIofStartList(
      {
        ...LIST,
        runners: [
          { time: "10:00", name: "A B", class: "H21", start: "S1", course: "Bana 1" },
          { time: "10:01", name: "C D", class: "H21", start: "S2", course: "Bana 1" },
        ],
      },
      { utcOffsetMinutes: 60 },
    );
    expect(xml).not.toContain("<StartName>");
    expect(xml).toContain("<Name>Bana 1</Name>");
    expect(xml).toContain("<StartTime>2026-05-02T10:00:00+01:00</StartTime>");
    expect(read(xml).runners.map((r) => r.time)).toEqual(["10:00:00", "10:01:00"]);
  });

  it("takes the date and the event id from the options, and the offset from the computer", () => {
    const xml = writeIofStartList(
      { createdAt: "", competition: { name: "", date: "" }, runners: LIST.runners.slice(0, 1) },
      { date: "2026-07-04", eventId: "4711", createTime: "2026-07-04T06:00:00Z" },
    );
    expect(xml).toContain("<Id>4711</Id>");
    expect(xml).toContain("<Date>2026-07-04</Date>");
    const noon = new Date("2026-07-04T12:00:00");
    const minutes = -noon.getTimezoneOffset();
    const sign = minutes < 0 ? "-" : "+";
    const abs = Math.abs(minutes);
    const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
    expect(xml).toContain(`<StartTime>2026-07-04T10:00:00${offset}</StartTime>`);
    expect(xml).toContain("<Name></Name>");
  });

  it("refuses an empty list, a bad date and a time that is not a clock time", () => {
    const codeOf = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return e instanceof FormatError ? e.code : "other";
      }
      return "none";
    };
    expect(codeOf(() => writeIofStartList({ ...LIST, runners: [] }))).toBe("empty");
    expect(codeOf(() => writeIofStartList(LIST, { date: "2.5.2026" }))).toBe("unreadable");
    expect(
      codeOf(() => writeIofStartList({ ...LIST, runners: [{ time: "kl 10", name: "A B" }] })),
    ).toBe("unreadable");
  });

  it("splits a name on its last word", () => {
    expect(splitRunnerName("Anna Lindberg")).toEqual({ given: "Anna", family: "Lindberg" });
    expect(splitRunnerName("  Jan  de Vries ")).toEqual({ given: "Jan de", family: "Vries" });
    expect(splitRunnerName("Vakant")).toEqual({ given: "", family: "Vakant" });
    expect(splitRunnerName("")).toEqual({ given: "", family: "" });
  });
});
