/**
 * Writes results as an IOF XML 3.0 `ResultList`, the file Eventor, MeOS, WinSplits and
 * Livelox import. The results come in the package's own form (`ResultList`), with the
 * places, times and statuses the caller already has: nothing is ranked or worked out here.
 *
 * Layout (only the elements written here, in the order the schema fixes):
 *
 * ```xml
 * <ResultList xmlns="http://www.orienteering.org/datastandard/3.0" iofVersion="3.0"
 *             createTime="…" creator="…" status="Complete">
 *   <Event>
 *     <Name>Veckans bana</Name>
 *     <StartTime><Date>2026-10-29</Date></StartTime>
 *     <EndTime><Date>2026-11-01</Date></EndTime>             (when given)
 *     <Organiser><Name>Strängnäs OK</Name></Organiser>     (when given)
 *   </Event>
 *   <ClassResult>                                           (one per class, in order)
 *     <Class><Name>Lång</Name></Class>
 *     <Course><Name>Lång</Name><Length>4100</Length><NumberOfControls>17</NumberOfControls></Course>
 *     <PersonResult>                                        (one per runner, in order)
 *       <Person><Name><Family>Berg</Family><Given>Elin</Given></Name></Person>
 *       <Organisation><Name>Mossens IF</Name></Organisation>
 *       <Result>
 *         <StartTime>…</StartTime><FinishTime>…</FinishTime>
 *         <Time>1512</Time><TimeBehind>0</TimeBehind><Position>1</Position>
 *         <Status>OK</Status>
 *         <Score type="Score">304</Score><Score type="Penalty">6</Score>   (score courses)
 *         <SplitTime><ControlCode>31</ControlCode><Time>245</Time></SplitTime>
 *         <SplitTime status="Missing"><ControlCode>32</ControlCode></SplitTime>
 *       </Result>
 *     </PersonResult>
 *   </ClassResult>
 * </ResultList>
 * ```
 *
 * - Times (`time`, `timeBehind`, split times) are seconds, as the schema has them; split
 *   times are counted from the start. A split without a time is written as missing.
 * - Start and finish are ms since 1970, written with the offset of `timeZone` (an IANA
 *   name such as "Europe/Stockholm") at that moment, else in UTC.
 * - The name is one string, split like the start list's (`splitRunnerName`).
 * - `complete: false` writes `status="Snapshot"`: results taken while runners are still out.
 */

import { FormatError } from "../errors.js";
import { splitRunnerName } from "./write-start-list.js";

/** A runner's status in IOF XML 3.0 (`ResultStatus`). */
export type IofResultStatus =
  | "OK"
  | "Finished"
  | "MissingPunch"
  | "Disqualified"
  | "DidNotFinish"
  | "Active"
  | "Inactive"
  | "OverTime"
  | "SportingWithdrawal"
  | "NotCompeting"
  | "Moved"
  | "MovedUp"
  | "DidNotStart"
  | "DidNotEnter"
  | "Cancelled";

/** One runner's result. */
export type ResultListRunner = {
  /** The runner's name as one string. */
  name: string;
  club?: string;
  status: IofResultStatus;
  /** 1, 2 …; left out when the runner is not placed. */
  position?: number;
  /** Running time in seconds. */
  time?: number;
  /** Seconds behind the winner. */
  timeBehind?: number;
  /** The start and the finish, ms since 1970. */
  startTime?: number;
  finishTime?: number;
  /** Points after the penalty, on a score course. */
  score?: number;
  /** Points taken off for time over the limit, on a score course. */
  penalty?: number;
  /** The time at each control from the start, in course order; no time means missing. */
  splits?: { controlCode: string; time?: number }[];
  /** The runner's control card (SI card) number. */
  card?: string | number;
};

/** One class (or course) and its results. */
export type ResultListClass = {
  name: string;
  course?: {
    name?: string;
    lengthMeters?: number;
    climbMeters?: number;
    numberOfControls?: number;
  };
  /** In the order to write them: placed runners first, as the list shows them. */
  results: ResultListRunner[];
};

/** The results of one event, in the package's own form. */
export type ResultList = {
  event: {
    name: string;
    /** The first day, "YYYY-MM-DD". */
    date?: string;
    /** The last day, "YYYY-MM-DD", for an event over several days. */
    endDate?: string;
    organiser?: string;
  };
  /** False while results may still change (`status="Snapshot"`); true when final. */
  complete: boolean;
  classes: ResultListClass[];
};

/** Options for `writeIofResultList`. */
export type WriteIofResultListOptions = {
  /** The program writing the file, for the root element's `creator`. */
  creator?: string;
  /** When the file is written (ISO 8601); now when not given. */
  createTime?: string;
  /** The event's time zone (IANA name) for start and finish times; UTC when not given. */
  timeZone?: string;
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
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The zone's offset from UTC at `ms`, in minutes ahead of UTC; 0 for an unknown zone. */
function offsetAt(ms: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(ms);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return Math.round((wall - Math.floor(ms / 1000) * 1000) / 60_000);
  } catch {
    return 0;
  }
}

/** `ms` as ISO 8601 in the zone ("2026-10-29T18:04:05+01:00"), or in UTC ("…Z"). */
function dateTime(ms: number, timeZone: string | undefined): string {
  const offset = timeZone ? offsetAt(ms, timeZone) : 0;
  const d = new Date(Math.floor(ms / 1000) * 1000 + offset * 60_000);
  const day = `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
  const clock = `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
  if (offset === 0) return `${day}T${clock}Z`;
  const abs = Math.abs(offset);
  return `${day}T${clock}${offset < 0 ? "-" : "+"}${two(Math.floor(abs / 60))}:${two(abs % 60)}`;
}

/** Seconds as the schema's double: whole seconds as integers, else to a tenth. */
function seconds(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

/** Whether `value` is a finite number that is not negative. */
const usable = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0;

/**
 * Writes an IOF XML 3.0 ResultList file.
 *
 * @param list - The results; see the module comment for how they are written.
 * @throws {FormatError} `empty` when no class has a result, or `unreadable` when a date is
 *   not "YYYY-MM-DD".
 */
export function writeIofResultList(list: ResultList, options: WriteIofResultListOptions = {}): string {
  if (!list.classes.some((c) => c.results.length > 0)) throw new FormatError("empty");
  const { date, endDate, organiser } = list.event;
  if ((date !== undefined && !DAY.test(date)) || (endDate !== undefined && !DAY.test(endDate))) {
    throw new FormatError("unreadable");
  }
  const creator = options.creator ?? "orienteering-formats";
  const createTime = options.createTime ?? new Date().toISOString();
  const zone = options.timeZone;

  const lines: string[] = [];
  const pad = (indent: number) => "  ".repeat(indent);
  const text = (indent: number, name: string, value: string | number | undefined) => {
    if (value === undefined || value === "") return;
    lines.push(`${pad(indent)}<${name}>${escapeXml(String(value))}</${name}>`);
  };
  const open = (indent: number, name: string) => lines.push(`${pad(indent)}<${name}>`);
  const close = (indent: number, name: string) => lines.push(`${pad(indent)}</${name}>`);
  const day = (indent: number, name: string, value: string | undefined) => {
    if (value === undefined) return;
    open(indent, name);
    text(indent + 1, "Date", value);
    close(indent, name);
  };

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<ResultList xmlns="http://www.orienteering.org/datastandard/3.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" iofVersion="3.0" createTime="${escapeXml(createTime)}" creator="${escapeXml(creator)}" status="${list.complete ? "Complete" : "Snapshot"}">`,
  );
  open(1, "Event");
  // The schema wants a name; an empty element says there is none.
  lines.push(`${pad(2)}<Name>${escapeXml(list.event.name)}</Name>`);
  day(2, "StartTime", date);
  day(2, "EndTime", endDate);
  if (organiser) {
    open(2, "Organiser");
    text(3, "Name", organiser);
    close(2, "Organiser");
  }
  close(1, "Event");

  for (const cls of list.classes) {
    if (cls.results.length === 0) continue;
    open(1, "ClassResult");
    open(2, "Class");
    lines.push(`${pad(3)}<Name>${escapeXml(cls.name)}</Name>`);
    close(2, "Class");
    const course = cls.course;
    if (course) {
      open(2, "Course");
      text(3, "Name", course.name);
      if (usable(course.lengthMeters)) text(3, "Length", Math.round(course.lengthMeters));
      if (usable(course.climbMeters)) text(3, "Climb", Math.round(course.climbMeters));
      if (usable(course.numberOfControls)) text(3, "NumberOfControls", course.numberOfControls);
      close(2, "Course");
    }
    for (const r of cls.results) {
      const { given, family } = splitRunnerName(r.name);
      open(2, "PersonResult");
      open(3, "Person");
      open(4, "Name");
      lines.push(`${pad(5)}<Family>${escapeXml(family)}</Family>`);
      lines.push(`${pad(5)}<Given>${escapeXml(given)}</Given>`);
      close(4, "Name");
      close(3, "Person");
      if (r.club) {
        open(3, "Organisation");
        text(4, "Name", r.club);
        close(3, "Organisation");
      }
      open(3, "Result");
      if (usable(r.startTime)) text(4, "StartTime", dateTime(r.startTime, zone));
      if (usable(r.finishTime)) text(4, "FinishTime", dateTime(r.finishTime, zone));
      if (usable(r.time)) text(4, "Time", seconds(r.time));
      if (usable(r.timeBehind)) text(4, "TimeBehind", seconds(r.timeBehind));
      if (usable(r.position)) text(4, "Position", r.position);
      text(4, "Status", r.status);
      if (r.score !== undefined && Number.isFinite(r.score)) {
        lines.push(`${pad(4)}<Score type="Score">${r.score}</Score>`);
      }
      if (usable(r.penalty) && r.penalty > 0) {
        lines.push(`${pad(4)}<Score type="Penalty">${r.penalty}</Score>`);
      }
      for (const split of r.splits ?? []) {
        if (usable(split.time)) {
          open(4, "SplitTime");
          text(5, "ControlCode", split.controlCode);
          text(5, "Time", seconds(split.time));
          close(4, "SplitTime");
        } else {
          lines.push(`${pad(4)}<SplitTime status="Missing">`);
          text(5, "ControlCode", split.controlCode);
          close(4, "SplitTime");
        }
      }
      text(4, "ControlCard", r.card);
      close(3, "Result");
      close(2, "PersonResult");
    }
    close(1, "ClassResult");
  }
  lines.push("</ResultList>");
  return lines.join("\n") + "\n";
}
