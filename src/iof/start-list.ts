/**
 * Reads start lists from IOF XML `StartList` files, as Eventor and timing programs
 * export them, into the package's own start list form (`StartList`, the `cf-startlist`
 * that ControlFreak Event sends to the start clock as a QR film).
 *
 * Two versions are in circulation:
 *
 * - **3.0**: `<StartList iofVersion="3.0">` with `<Event>`, then `<ClassStart>` holding
 *   `<Class><Name>`, `<StartName>` and `<PersonStart>` elements, each with
 *   `<Person><Name><Given/><Family/>`, `<Organisation><Name/>` and
 *   `<Start><StartTime>2024-05-01T10:00:00+02:00</StartTime><ControlCard/>`.
 * - **2.0.3** (Eventor's own `/api/starts/event`): `<ClassStart>` with `<EventClass>`,
 *   `<PersonStart>` with `<PersonName>`, `<Start><StartTime><Clock>10:00:00</Clock>`
 *   and `<CCard><CCardId>`.
 *
 * Start times are wall-clock times as the file states them (the local competition time,
 * which is what a start clock shows), never shifted to another time zone. Runners
 * without a start time or a name are left out: a start list is for those who start at a
 * time. Relay teams (`<TeamStart>`) are not read.
 */

import { FormatError } from "../errors.js";
import type { StartList, StartListRunner } from "../start-list.js";
import { childElement, childElements, childText, numberOf, parseXmlRoot } from "../xml.js";
import type { IofVersion, ReadIofOptions } from "./course-data.js";

/** The runners of a StartList file, with what the file says about itself. */
export type IofStartList = StartList & {
  /** Which version the file was written in. */
  version: IofVersion;
};

/** Whether XML text looks like an IOF StartList file (checks the root element only). */
export function looksLikeIofStartList(xml: string): boolean {
  return /<(?:\w+:)?StartList[\s>]/.test(xml.slice(0, 2000));
}

/** "HH:MM:SS" from the time a file states, in any of its shapes; undefined if none. */
function clockTime(text: string): string | undefined {
  // ISO 8601 dateTime (3.0): the wall clock as written, whatever the offset says.
  const iso = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (iso) return `${iso[1]}:${iso[2]}:${iso[3] ?? "00"}`;
  // A plain clock time (2.0.3's <Clock>, and some exports): "9:02:00" or "09:02".
  const plain = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text.trim());
  if (plain) return `${plain[1]!.padStart(2, "0")}:${plain[2]}:${plain[3] ?? "00"}`;
  return undefined;
}

/** The name of a class element, in 3.0 (`<Class>`) or 2.0.3 (`<EventClass>`) shape. */
function className(parent: Element): string | undefined {
  const element = childElement(parent, "Class") ?? childElement(parent, "EventClass");
  const name =
    childText(element, "Name") ||
    childText(element, "ShortName") ||
    childText(element, "ClassShortName") ||
    childText(parent, "ClassShortName") ||
    (element?.textContent ?? "").trim();
  return name || undefined;
}

/** One `<PersonStart>` as a runner, or undefined when it has no name or start time. */
function runnerOf(
  personStart: Element,
  classStart: Element | undefined,
): StartListRunner | undefined {
  const person = childElement(personStart, "Person");
  const name = childElement(person, "Name") ?? childElement(person, "PersonName");
  const fullName = [childText(name, "Given"), childText(name, "Family")]
    .filter((part) => part !== "")
    .join(" ");
  const start = childElement(personStart, "Start");
  const startTime = childElement(start, "StartTime");
  const time = clockTime(childText(startTime, "Clock") || (startTime?.textContent ?? ""));
  if (!fullName || !time) return undefined;

  const organisation =
    childElement(personStart, "Organisation") ?? childElement(personStart, "Club");
  const club = childText(organisation, "Name") || childText(organisation, "ShortName");
  const card =
    numberOf(childText(start, "ControlCard")) ??
    numberOf(childText(childElement(start, "CCard"), "CCardId")) ??
    numberOf(childText(childElement(personStart, "CCard"), "CCardId"));
  const startName = childText(start, "StartName") || childText(classStart, "StartName");
  const cls = className(personStart) ?? (classStart ? className(classStart) : undefined);
  return {
    time,
    name: fullName,
    ...(club ? { club } : {}),
    ...(cls ? { class: cls } : {}),
    ...(card !== undefined && Number.isInteger(card) ? { card } : {}),
    ...(startName ? { start: startName } : {}),
  };
}

/**
 * Reads an IOF XML StartList file, version 3.0 or 2.0.3.
 *
 * @param xml - The file's text; see `decodeXmlBytes` for getting it from bytes.
 * @throws {FormatError} `unreadable` for broken XML, `wrong-format` when the root is
 *   not `StartList`, and `empty` when the file has no runner with a start time.
 */
export function readIofStartList(xml: string, options: ReadIofOptions = {}): IofStartList {
  const root = parseXmlRoot(xml, options.parseXml);
  if (root.localName !== "StartList") throw new FormatError("wrong-format");
  const version: IofVersion =
    root.getAttribute("iofVersion")?.startsWith("3") ||
    (childElements(root, "IOFVersion").length === 0 &&
      childElements(root, "ClassStart").some((cs) => childElement(cs, "Class") !== undefined))
      ? "3.0"
      : "2.0.3";

  const runners: StartListRunner[] = [];
  for (const classStart of childElements(root, "ClassStart")) {
    for (const personStart of childElements(classStart, "PersonStart")) {
      const runner = runnerOf(personStart, classStart);
      if (runner) runners.push(runner);
    }
  }
  // A flat list, with the starts directly under the root.
  for (const personStart of childElements(root, "PersonStart")) {
    const runner = runnerOf(personStart, undefined);
    if (runner) runners.push(runner);
  }
  if (runners.length === 0) throw new FormatError("empty");

  const event = childElement(root, "Event");
  return {
    version,
    createdAt: root.getAttribute("createTime") ?? "",
    competition: {
      name: childText(event, "Name"),
      date: childText(childElement(event, "StartTime"), "Date"),
    },
    runners,
  };
}
