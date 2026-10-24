/**
 * Writes a start list as an IOF XML 3.0 `StartList`, the file Eventor's start list
 * import and timing programs read. The counterpart of `readIofStartList`: a list written
 * here reads back the same.
 *
 * The file is written from the package's own start list form (`StartList`, the
 * `cf-startlist` of the QR film), which is what the start clock holds whatever the list
 * came from, so a list typed as CSV or sent from ControlFreak Event can go on to Eventor.
 *
 * Layout (only the elements written here, in the order the schema fixes):
 *
 * ```xml
 * <StartList xmlns="http://www.orienteering.org/datastandard/3.0" iofVersion="3.0"
 *            createTime="…" creator="…">
 *   <Event><Id>4711</Id><Name>Vårspringet</Name><StartTime><Date>2026-04-18</Date></StartTime></Event>
 *   <ClassStart>                                   (one per class, in order of first runner)
 *     <Class><Name>H21</Name></Class>
 *     <Course><Name>Bana 1</Name></Course>          (when every runner in the class has the same)
 *     <StartName>S1</StartName>                     (likewise)
 *     <PersonStart>                                 (one per runner, in the list's order)
 *       <Person><Name><Family>Berg</Family><Given>Johan</Given></Name></Person>
 *       <Organisation><Name>IFK Lidingö</Name></Organisation>
 *       <Start><StartTime>2026-04-18T10:00:00+02:00</StartTime><ControlCard>7099123</ControlCard></Start>
 *     </PersonStart>
 *   </ClassStart>
 * </StartList>
 * ```
 *
 * - The form has one `name` per runner; the file wants given and family names. The last
 *   word is written as the family name and the rest as the given name, which is right
 *   for most names and what a reader joins back to the same string. Eventor matches a
 *   runner without an Eventor id on the name and the club, so a double family name may
 *   need a look after the import.
 * - Start times are the form's clock times on the competition's date, with the time
 *   zone's offset: `date` and `utcOffsetMinutes` from the options, else the list's
 *   `competition.date` and the computer's offset on that day, which is right when the
 *   file is written where the competition is held.
 * - Runners without a class are written in one `<ClassStart>` with an empty class name;
 *   Eventor needs the class names to match its own, so give the runners classes when
 *   the file is for it.
 * - `late` has no element in a start list and is not written.
 */

import { FormatError } from "../errors.js";
import type { StartList, StartListRunner } from "../start-list.js";

/** Options for `writeIofStartList`. */
export type WriteIofStartListOptions = {
  /** The program writing the file, for the root element's `creator`. */
  creator?: string;
  /** When the file is written (ISO 8601); the list's `createdAt`, else now, when not given. */
  createTime?: string;
  /** Eventor's id of the event, written as `<Event><Id>`, so Eventor knows which event. */
  eventId?: string;
  /**
   * The competition's date, "YYYY-MM-DD", for the start times; the list's
   * `competition.date`, else today, when not given.
   */
  date?: string;
  /**
   * The competition's time zone as minutes ahead of UTC (120 for Swedish summer time);
   * the computer's own offset on the date when not given.
   */
  utcOffsetMinutes?: number;
};

/** Escapes text for XML content and attribute values. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const two = (n: number) => String(n).padStart(2, "0");

/** Today as "YYYY-MM-DD" in the computer's own time zone. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** The computer's offset from UTC at noon on `date`, in minutes ahead of UTC. */
function localOffsetMinutes(date: string): number {
  const noon = new Date(`${date}T12:00:00`);
  return Number.isNaN(noon.getTime()) ? 0 : -noon.getTimezoneOffset();
}

/** "+02:00" for 120. */
function offsetText(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(Math.round(minutes));
  return `${sign}${two(Math.floor(abs / 60))}:${two(abs % 60)}`;
}

/** Given and family name from one string: the last word is the family name. */
export function splitRunnerName(name: string): { given: string; family: string } {
  const words = name.trim().split(/\s+/).filter((w) => w !== "");
  const family = words.pop() ?? "";
  return { given: words.join(" "), family };
}

/** The one value every runner shares, or undefined when they differ or none has one. */
function shared(runners: StartListRunner[], field: "course" | "start"): string | undefined {
  const values = new Set(runners.map((r) => r[field] ?? ""));
  if (values.size !== 1) return undefined;
  const [value] = values;
  return value === "" ? undefined : value;
}

/**
 * Writes an IOF XML 3.0 StartList file.
 *
 * @param list - The runners, in start order; see the module comment for how they are written.
 * @throws {FormatError} `empty` when the list has no runner, or `unreadable` when the
 *   date is not "YYYY-MM-DD" or a runner's time is not a clock time.
 */
export function writeIofStartList(list: StartList, options: WriteIofStartListOptions = {}): string {
  if (list.runners.length === 0) throw new FormatError("empty");
  const creator = options.creator ?? "orienteering-formats";
  const createTime = options.createTime ?? (list.createdAt || new Date().toISOString());
  const date = options.date ?? (list.competition.date || today());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new FormatError("unreadable");
  const offset = offsetText(options.utcOffsetMinutes ?? localOffsetMinutes(date));

  // Classes in the order their first runner has, runners in the list's order.
  const classes = new Map<string, StartListRunner[]>();
  for (const runner of list.runners) {
    const key = runner.class ?? "";
    const group = classes.get(key);
    if (group) group.push(runner);
    else classes.set(key, [runner]);
  }

  const lines: string[] = [];
  const pad = (indent: number) => "  ".repeat(indent);
  const text = (indent: number, name: string, value: string | number | undefined) => {
    if (value === undefined || value === "") return;
    lines.push(`${pad(indent)}<${name}>${escapeXml(String(value))}</${name}>`);
  };
  const open = (indent: number, name: string) => lines.push(`${pad(indent)}<${name}>`);
  const close = (indent: number, name: string) => lines.push(`${pad(indent)}</${name}>`);

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<StartList xmlns="http://www.orienteering.org/datastandard/3.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" iofVersion="3.0" createTime="${escapeXml(createTime)}" creator="${escapeXml(creator)}">`,
  );
  open(1, "Event");
  text(2, "Id", options.eventId);
  // The schema wants a name; an empty element says there is none.
  lines.push(`${pad(2)}<Name>${escapeXml(list.competition.name)}</Name>`);
  open(2, "StartTime");
  text(3, "Date", date);
  close(2, "StartTime");
  close(1, "Event");

  for (const [className, runners] of classes) {
    open(1, "ClassStart");
    open(2, "Class");
    lines.push(`${pad(3)}<Name>${escapeXml(className)}</Name>`);
    close(2, "Class");
    const course = shared(runners, "course");
    if (course !== undefined) {
      open(2, "Course");
      text(3, "Name", course);
      close(2, "Course");
    }
    text(2, "StartName", shared(runners, "start"));
    for (const runner of runners) {
      const time = /^\d{2}:\d{2}(:\d{2})?$/.exec(runner.time);
      if (!time) throw new FormatError("unreadable");
      const clock = time[1] ? runner.time : `${runner.time}:00`;
      const { given, family } = splitRunnerName(runner.name);
      open(2, "PersonStart");
      open(3, "Person");
      open(4, "Name");
      lines.push(`${pad(5)}<Family>${escapeXml(family)}</Family>`);
      lines.push(`${pad(5)}<Given>${escapeXml(given)}</Given>`);
      close(4, "Name");
      close(3, "Person");
      if (runner.club) {
        open(3, "Organisation");
        text(4, "Name", runner.club);
        close(3, "Organisation");
      }
      open(3, "Start");
      text(4, "StartTime", `${date}T${clock}${offset}`);
      text(4, "ControlCard", runner.card);
      close(3, "Start");
      close(2, "PersonStart");
    }
    close(1, "ClassStart");
  }
  lines.push("</StartList>");
  return lines.join("\n") + "\n";
}
