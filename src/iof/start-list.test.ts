import { describe, expect, it } from "vitest";

import { FormatError } from "../errors.js";
import { parseXml } from "../test-xml.js";
import { looksLikeIofStartList, readIofStartList } from "./start-list.js";

const read = (xml: string) => readIofStartList(xml, { parseXml });
const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return e instanceof FormatError ? e.code : "other";
  }
  return "none";
};

/** Eventor's own format, IOF XML 2.0.3. */
const IOF_203 = `<?xml version="1.0" encoding="UTF-8"?>
<StartList>
  <EventId>12345</EventId>
  <ClassStart>
    <EventClass><EventClassId>1</EventClassId><Name>D21</Name><ClassShortName>D21</ClassShortName></EventClass>
    <PersonStart>
      <Person sex="F"><PersonId>1</PersonId><PersonName><Family>Lindberg</Family><Given sequence="1">Anna</Given></PersonName></Person>
      <Organisation><OrganisationId>10</OrganisationId><Name>Tyrso IF</Name><ShortName>TIF</ShortName></Organisation>
      <Start><StartTime><Date>2024-05-01</Date><Clock>10:00:00</Clock></StartTime><BibNumber>101</BibNumber><CCard><CCardId>8123456</CCardId></CCard></Start>
    </PersonStart>
    <PersonStart>
      <Person sex="F"><PersonName><Family>Svensson</Family><Given>Karin</Given></PersonName></Person>
      <Organisation><Name>Gävle OK</Name></Organisation>
      <Start><StartTime><Clock>9:02:00</Clock></StartTime></Start>
    </PersonStart>
  </ClassStart>
  <ClassStart>
    <EventClass><Name>H21</Name></EventClass>
    <PersonStart>
      <Person><PersonName><Family>Johansson</Family><Given>Erik</Given></PersonName></Person>
      <Organisation><Name>Kringla TR</Name></Organisation>
      <Start><StartTime><Clock>10:00:00</Clock></StartTime></Start>
    </PersonStart>
  </ClassStart>
</StartList>`;

const IOF_30 = `<?xml version="1.0" encoding="UTF-8"?>
<StartList xmlns="http://www.orienteering.org/datastandard/3.0" iofVersion="3.0" createTime="2024-05-01T08:00:00+02:00">
  <Event><Id>12345</Id><Name>Vårtävling</Name><StartTime><Date>2024-05-01</Date></StartTime></Event>
  <ClassStart>
    <Class><Id>1</Id><Name>D21</Name><ShortName>D21</ShortName></Class>
    <Course><Length>7800</Length></Course>
    <StartName>Start 1</StartName>
    <PersonStart>
      <Person sex="F"><Id type="Eventor">1</Id><Name><Family>Lindberg</Family><Given>Anna</Given></Name></Person>
      <Organisation><Id>10</Id><Name>Tyrso IF</Name><ShortName>TIF</ShortName></Organisation>
      <Start><BibNumber>101</BibNumber><StartTime>2024-05-01T10:00:00+02:00</StartTime><ControlCard>8123456</ControlCard></Start>
    </PersonStart>
    <PersonStart>
      <Person><Name><Family>Svensson</Family><Given>Karin</Given></Name></Person>
      <Organisation><Name>Gävle OK</Name></Organisation>
      <Start><StartTime>2024-05-01T09:02:00+02:00</StartTime></Start>
    </PersonStart>
  </ClassStart>
  <ClassStart>
    <Class><Name>H21</Name></Class>
    <PersonStart>
      <Person><Name><Family>Johansson</Family><Given>Erik</Given></Name></Person>
      <Organisation><Name>Kringla TR</Name></Organisation>
      <Start><StartTime>2024-05-01T10:00:00Z</StartTime></Start>
    </PersonStart>
    <PersonStart>
      <Person><Name><Family>Vakant</Family><Given></Given></Name></Person>
      <Start><StartTime>2024-05-01T10:01:00+02:00</StartTime></Start>
    </PersonStart>
    <PersonStart>
      <Person><Name><Family>Utan</Family><Given>Tid</Given></Name></Person>
      <Start><BibNumber>7</BibNumber></Start>
    </PersonStart>
  </ClassStart>
</StartList>`;

const EXPECTED = [
  { time: "10:00:00", name: "Anna Lindberg", club: "Tyrso IF", class: "D21", card: 8123456 },
  { time: "09:02:00", name: "Karin Svensson", club: "Gävle OK", class: "D21" },
  { time: "10:00:00", name: "Erik Johansson", club: "Kringla TR", class: "H21" },
];

describe("readIofStartList", () => {
  it("reads Eventor's 2.0.3 format, with <Clock> times and CCard numbers", () => {
    const list = read(IOF_203);
    expect(list.version).toBe("2.0.3");
    expect(list.runners).toEqual(EXPECTED);
    expect(list.competition).toEqual({ name: "", date: "" });
  });

  it("reads 3.0, taking the wall clock as written and leaving out runners without a time", () => {
    const list = read(IOF_30);
    expect(list.version).toBe("3.0");
    expect(list.createdAt).toBe("2024-05-01T08:00:00+02:00");
    expect(list.competition).toEqual({ name: "Vårtävling", date: "2024-05-01" });
    expect(list.runners).toEqual([
      { ...EXPECTED[0], start: "Start 1" },
      { ...EXPECTED[1], start: "Start 1" },
      EXPECTED[2],
      { time: "10:01:00", name: "Vakant", class: "H21" },
    ]);
  });

  it("does not take <ClassStart> for <Class>, and reads a flat list", () => {
    const one = read(
      "<StartList><ClassStart><Class><Name>Ö5</Name></Class><PersonStart><Person><Name><Given>A</Given><Family>B</Family></Name></Person><Start><StartTime>2024-01-01T10:00:00+01:00</StartTime></Start></PersonStart></ClassStart></StartList>",
    );
    expect(one.runners).toEqual([{ time: "10:00:00", name: "A B", class: "Ö5" }]);
    const flat = read(
      "<StartList><PersonStart><Person><PersonName><Given>A</Given><Family>B</Family></PersonName></Person><Start><StartTime>7:05</StartTime></Start></PersonStart></StartList>",
    );
    expect(flat.runners).toEqual([{ time: "07:05:00", name: "A B" }]);
    expect(flat.version).toBe("2.0.3");
  });

  it("recognises the file and explains broken, wrong and empty ones by code", () => {
    expect(looksLikeIofStartList(IOF_30)).toBe(true);
    expect(looksLikeIofStartList('<iof:StartList xmlns:iof="x">')).toBe(true);
    expect(looksLikeIofStartList("<ResultList/>")).toBe(false);
    expect(codeOf(() => read("<StartList><broken"))).toBe("unreadable");
    expect(codeOf(() => read("<ResultList/>"))).toBe("wrong-format");
    expect(codeOf(() => read("<StartList><ClassStart/></StartList>"))).toBe("empty");
  });
});
