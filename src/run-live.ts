/**
 * Live punches from ControlFreak Run ("cf-run-live"): how the runner's phone sends its run
 * to ControlFreak Live while the runner is out, and how the site shows it.
 *
 * There are two ways in, with the same body and the same answers:
 *
 * - **A competition.** The organiser creates the competition on the site, which gives a
 *   **runner link** ({@link runLiveLink}). A runner who opens it before the start has the
 *   phone send the run to `{base}` from the link, with `Authorization: Bearer <runner key>`.
 *   The key is the same for every runner of the competition, since it is printed or shared
 *   openly.
 * - **A course without a competition.** Any runner on any course link can send the run to the
 *   site's address for courses, `{origin}{@link RUN_LIVE_OPEN_PATH}`
 *   ({@link runLiveOpenBase}), **without a key**. The body then must carry `courseLink`; the site reads the course from it and
 *   groups the runners of one course on one page by `openCourseId` (in
 *   `orienteering-formats/run`), so two links of the same course meet on the same page.
 *
 * The body holds the name the runner gave, the course's name and control codes, the start,
 * every punch and the finish, and optionally the runner's club (`club`) and the course link
 * (`courseLink`). Never the track
 * or any position.
 *
 * The phone sends the whole run each time, so a lost upload is mended by the next:
 * - `PUT {base}/runners/{runnerId}` ({@link runLiveRunnerUrl}) with a {@link RunLiveBody}.
 * - `runnerId` and `secret` are made by the phone for each run ({@link newRunnerId}). The
 *   site keeps a hash of the secret from the first upload and refuses a later upload for
 *   the same runner with another secret (`403`), so one runner cannot overwrite another.
 *   This holds on the keyless address too.
 * - Answers: `204` stored, `400` not a body of this protocol (on the keyless address also: no
 *   readable `courseLink`), `401` wrong key, `403` wrong secret, `404` no such competition,
 *   `413` too large. CORS as in cf-live.
 *
 * `club` and `courseLink` are optional fields within version 1: a body without them is as
 * valid as before, and a site that does not know them drops them.
 *
 * This module imports nothing, like `cf-live`. The id of a course's page needs the
 * course link reader, so it lives in `orienteering-formats/run` (`openCourseId`).
 */

/** The protocol's name, in every body. */
export const RUN_LIVE_PROTOCOL = "cf-run-live";

/** The version this module writes and reads. */
export const RUN_LIVE_VERSION = 1;

/** The longest name a runner may give, in characters. */
export const RUN_LIVE_NAME_MAX = 60;

/** The longest club a runner may give, in characters. */
export const RUN_LIVE_CLUB_MAX = 60;

/** Most controls a course may hold, as in the course link. */
const MAX_CONTROLS = 1000;

/**
 * Path of the keyless address on a ControlFreak Live site, for runs on any course without a
 * competition: the phone sends to `{origin}/api/public/cf-run/open/runners/{runnerId}`.
 */
export const RUN_LIVE_OPEN_PATH = "/api/public/cf-run/open";

/** Longest `courseLink` kept, in characters: a course link of about 1000 controls. */
export const RUN_LIVE_COURSE_LINK_MAX = 16_000;

/** Address of the runner page in ControlFreak Run; the link's data follows `#`. */
export const RUN_LIVE_LINK_PREFIX = "https://run.controlfreak.se/live#";

/** A control of the course as sent: its code, and its points on a score course. */
export interface RunLiveControl {
  code: number;
  /** Points on a score course; absent otherwise. */
  points?: number;
}

/** A punch: which control (index in `course.controls`) and when (ms since 1970). */
export interface RunLivePunch {
  index: number;
  at: number;
}

/** One upload: the whole run so far. */
export interface RunLiveBody {
  protocol: typeof RUN_LIVE_PROTOCOL;
  version: number;
  /** The phone's id for this run, from {@link newRunnerId}. */
  runnerId: string;
  /** Proof that later uploads come from the same phone, from {@link newRunnerId}. */
  secret: string;
  /** The name the runner gave, at most {@link RUN_LIVE_NAME_MAX} characters. */
  name: string;
  /** The club the runner gave, at most {@link RUN_LIVE_CLUB_MAX} characters. Optional field
   * within version 1. */
  club?: string;
  course: {
    name: string;
    controls: RunLiveControl[];
    /** Score course rules, or null for a course with a fixed order. */
    score: { timeLimitMinutes: number; penaltyPerMinute: number } | null;
  };
  /** The start, ms since 1970. */
  startAt: number;
  /** Punches in the order they were made. */
  punches: RunLivePunch[];
  /** The finish, ms since 1970, or null while the runner is out. */
  finishAt: number | null;
  /** When the phone made the body, ISO 8601. */
  generatedAt: string;
  /**
   * The course link's data after `#` (the run payload, without `#`). Needed on the open
   * address, optional in a competition. Optional field within version 1.
   */
  courseLink?: string;
}

/** What the runner link carries. */
export interface RunLiveLink {
  /** The competition's base address on the site. */
  base: string;
  /** The runner key. */
  key: string;
}

/** The runner link for a competition, e.g. for a QR code on the map or at the start. */
export function runLiveLink(link: RunLiveLink): string {
  return (
    RUN_LIVE_LINK_PREFIX +
    new URLSearchParams({ b: link.base, k: link.key }).toString()
  );
}

/**
 * Reads the part of a runner link after `#` (with or without the `#`). Null when it is not
 * a runner link, or its address is not https.
 */
export function parseRunLiveLink(hash: string): RunLiveLink | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const base = params.get("b") ?? "";
  const key = params.get("k") ?? "";
  if (!key || key.length > 200) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" || url.search || url.hash) return null;
  } catch {
    return null;
  }
  return { base: base.replace(/\/+$/, ""), key };
}

/**
 * The base address of a site's courses (runs without a competition), from the site's origin
 * (e.g. `https://live.controlfreak.se`): `{origin}{@link RUN_LIVE_OPEN_PATH}`. Used like
 * `base` of a runner link, but without a key.
 *
 * @throws {TypeError} When `origin` is not an absolute URL.
 */
export function runLiveOpenBase(origin: string): string {
  return new URL(origin).origin + RUN_LIVE_OPEN_PATH;
}

/** Where the phone sends a runner's run: `{base}/runners/{runnerId}`. */
export function runLiveRunnerUrl(base: string, runnerId: string): string {
  return `${base.replace(/\/+$/, "")}/runners/${encodeURIComponent(runnerId)}`;
}

/** A new random runner id and secret, from the browser's Web Crypto. */
export function newRunnerId(): { runnerId: string; secret: string } {
  const hex = (n: number) =>
    Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
  return { runnerId: hex(16), secret: hex(32) };
}

/** The course link's payload (a leading `#` removed) if it may be one, else null. */
function checkCourseLink(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const link = x.startsWith("#") ? x.slice(1) : x;
  // The run payload alphabet, `0-9A-Z$*+-./:` (see `RUN_PAYLOAD_ALPHABET` in `run`).
  if (!link || link.length > RUN_LIVE_COURSE_LINK_MAX || !/^[0-9A-Z$*+\-./:]+$/.test(link)) return null;
  return link;
}

const isCount = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;
const isTime = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;

/**
 * Checks an upload and returns it in a clean form, or null when it is not a body of this
 * protocol. Unknown fields are dropped: the site stores only what it shows.
 *
 * The optional `club` is kept trimmed when it is a string of 1 to {@link RUN_LIVE_CLUB_MAX}
 * characters, and dropped otherwise. The optional `courseLink` is kept, without `#`, when it has only the course link's
 * characters and at most {@link RUN_LIVE_COURSE_LINK_MAX} of them, and dropped otherwise, so
 * it never costs the punches. Its course is not read here; the keyless address must still read
 * it (`openCourseId`).
 */
export function parseRunLiveBody(json: unknown): RunLiveBody | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const b = json as Record<string, unknown>;
  if (b.protocol !== RUN_LIVE_PROTOCOL || b.version !== RUN_LIVE_VERSION) return null;
  if (typeof b.runnerId !== "string" || !/^[0-9a-f]{32}$/.test(b.runnerId)) return null;
  if (typeof b.secret !== "string" || !/^[0-9a-f]{64}$/.test(b.secret)) return null;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > RUN_LIVE_NAME_MAX) return null;
  const course = b.course as Record<string, unknown> | undefined;
  if (typeof course !== "object" || course === null) return null;
  if (typeof course.name !== "string" || course.name.length > 100) return null;
  if (!Array.isArray(course.controls) || course.controls.length > MAX_CONTROLS) return null;
  const controls: RunLiveControl[] = [];
  for (const c of course.controls as unknown[]) {
    const control = c as Record<string, unknown> | null;
    if (!control || !isCount(control.code)) return null;
    if (control.points !== undefined && !isCount(control.points)) return null;
    controls.push(
      control.points === undefined ? { code: control.code } : { code: control.code, points: control.points },
    );
  }
  let score: RunLiveBody["course"]["score"] = null;
  if (course.score != null) {
    const s = course.score as Record<string, unknown>;
    if (!isCount(s.timeLimitMinutes) || !isCount(s.penaltyPerMinute)) return null;
    score = { timeLimitMinutes: s.timeLimitMinutes, penaltyPerMinute: s.penaltyPerMinute };
  }
  if (!isTime(b.startAt)) return null;
  if (!Array.isArray(b.punches) || b.punches.length > MAX_CONTROLS * 2) return null;
  const punches: RunLivePunch[] = [];
  for (const p of b.punches as unknown[]) {
    const punch = p as Record<string, unknown> | null;
    if (!punch || !isCount(punch.index) || punch.index >= controls.length || !isTime(punch.at)) {
      return null;
    }
    punches.push({ index: punch.index, at: punch.at });
  }
  if (b.finishAt !== null && !isTime(b.finishAt)) return null;
  const club = typeof b.club === "string" ? b.club.trim() : "";
  const courseLink = checkCourseLink(b.courseLink);
  const body: RunLiveBody = {
    protocol: RUN_LIVE_PROTOCOL,
    version: RUN_LIVE_VERSION,
    runnerId: b.runnerId,
    secret: b.secret,
    name,
    course: { name: course.name, controls, score },
    startAt: b.startAt,
    punches,
    finishAt: b.finishAt as number | null,
    generatedAt: typeof b.generatedAt === "string" ? b.generatedAt.slice(0, 40) : "",
  };
  if (club && club.length <= RUN_LIVE_CLUB_MAX) body.club = club;
  if (courseLink) body.courseLink = courseLink;
  return body;
}

/** A runner's row in the standings. Times are ms since the runner's start. */
export interface RunLiveRow {
  runnerId: string;
  name: string;
  /** The club the runner gave, or null. */
  club: string | null;
  /** `finished` once the phone has sent the finish, else `running`. */
  status: "running" | "finished";
  /** Place among the finished on the course (1, 2 …), or null while running or when not complete. */
  place: number | null;
  /** Running time to the finish, or null while running. */
  time: number | null;
  /** Controls taken: on a score course each control punched, once; on a fixed-order course
   * the controls taken in course order (see {@link RunLiveRow.splits}). */
  taken: number;
  /**
   * On a fixed-order course: the time at each control, in course order, or null if not
   * taken. As in ControlFreak Run's own result and in MeOS, each control takes the first
   * punch at it after the punch taken for the control before, in the order the punches were
   * made; a missing control does not move that position. A punch out of order (a control
   * passed early, or a code that is on the course twice) does not count where it was made.
   */
  splits: (number | null)[];
  /** On a score course: points after the penalty, else null. */
  points: number | null;
  /** On a fixed-order course: every control taken in course order. Always true on a score course. */
  complete: boolean;
  /** When the runner was last heard from, ms since 1970. */
  lastAt: number;
}

/** The runners on one course, best first. */
export interface RunLiveCourse {
  name: string;
  controls: RunLiveControl[];
  score: RunLiveBody["course"]["score"];
  rows: RunLiveRow[];
}

/**
 * The time of each control in course order: for each control the first punch at it after
 * the punch taken for the control before, in the order the punches were made (as Run's
 * `matchCourse` and MeOS). A missing control leaves the search where it was.
 */
function inCourseOrder(controlCount: number, punches: readonly RunLivePunch[]): (number | null)[] {
  const out: (number | null)[] = [];
  let from = 0;
  for (let i = 0; i < controlCount; i++) {
    let hit = -1;
    for (let j = from; j < punches.length; j++) {
      if (punches[j]!.index === i) {
        hit = j;
        break;
      }
    }
    if (hit < 0) {
      out.push(null);
      continue;
    }
    out.push(punches[hit]!.at);
    from = hit + 1;
  }
  return out;
}

function rowFor(body: RunLiveBody): RunLiveRow {
  const { controls, score } = body.course;
  const firstAt = new Map<number, number>();
  for (const p of body.punches) if (!firstAt.has(p.index)) firstAt.set(p.index, p.at);
  const ordered = score ? [] : inCourseOrder(controls.length, body.punches);
  const takenInOrder = ordered.filter((t) => t !== null).length;
  const time = body.finishAt === null ? null : Math.max(0, body.finishAt - body.startAt);
  let points: number | null = null;
  if (score) {
    let sum = 0;
    for (const i of firstAt.keys()) sum += controls[i]?.points ?? 0;
    const overMs = time === null ? 0 : time - score.timeLimitMinutes * 60_000;
    const penalty = overMs > 0 ? Math.ceil(overMs / 60_000) * score.penaltyPerMinute : 0;
    points = Math.max(0, sum - penalty);
  }
  const lastPunch = body.punches.reduce((m, p) => Math.max(m, p.at), body.startAt);
  return {
    runnerId: body.runnerId,
    name: body.name,
    club: body.club ?? null,
    status: body.finishAt === null ? "running" : "finished",
    place: null,
    time,
    taken: score ? firstAt.size : takenInOrder,
    splits: ordered.map((t) => (t === null ? null : t - body.startAt)),
    points,
    complete: score ? true : takenInOrder === controls.length,
    lastAt: Math.max(lastPunch, body.finishAt ?? 0),
  };
}

/**
 * The standings, one entry per course name, courses in name order. Finished runners with a
 * complete run come first, by points (score) and time; then the runners still out, by how
 * many controls they have taken and how early they took the last one; then those who
 * finished without every control.
 */
export function runLiveStandings(bodies: readonly RunLiveBody[]): RunLiveCourse[] {
  const byCourse = new Map<string, RunLiveCourse>();
  for (const body of bodies) {
    let course = byCourse.get(body.course.name);
    if (!course) {
      course = { name: body.course.name, controls: body.course.controls, score: body.course.score, rows: [] };
      byCourse.set(body.course.name, course);
    }
    course.rows.push(rowFor(body));
  }
  const group = (r: RunLiveRow) => (r.status === "finished" ? (r.complete ? 0 : 2) : 1);
  for (const course of byCourse.values()) {
    course.rows.sort(
      (a, b) =>
        group(a) - group(b) ||
        (b.points ?? 0) - (a.points ?? 0) ||
        (group(a) === 1 ? b.taken - a.taken || a.lastAt - b.lastAt : (a.time ?? 0) - (b.time ?? 0)) ||
        a.name.localeCompare(b.name),
    );
    let place = 0;
    let prev: RunLiveRow | null = null;
    course.rows.forEach((r, i) => {
      if (group(r) !== 0) return;
      if (!prev || prev.time !== r.time || prev.points !== r.points) place = i + 1;
      r.place = place;
      prev = r;
    });
  }
  return [...byCourse.values()].sort((a, b) => a.name.localeCompare(b.name));
}
