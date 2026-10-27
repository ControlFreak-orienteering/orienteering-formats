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
 * - **An open course.** Any runner on any course link can send the run to the site's open
 *   address, `{origin}{@link RUN_LIVE_OPEN_PATH}` ({@link runLiveOpenBase}), **without a
 *   key**. The body then must carry `courseLink`; the site reads the course from it and
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
 *   This holds on the open address too, which has no key.
 * - Answers: `204` stored, `400` not a body of this protocol (on the open address also: no
 *   readable `courseLink`), `401` wrong key, `403` wrong secret, `404` no such competition,
 *   `413` too large. CORS as in cf-live.
 *
 * `club` and `courseLink` are optional fields within version 1: a body without them is as
 * valid as before, and a site that does not know them drops them.
 *
 * This module imports nothing, like `cf-live`. The course id of an open course needs the
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
 * Path of the open address on a ControlFreak Live site, for runs on any course without a
 * competition: the phone sends to `{origin}/api/public/cf-run/open/runners/{runnerId}`.
 */
export const RUN_LIVE_OPEN_PATH = "/api/public/cf-run/open";
/** Longest `courseLink` kept, in characters: a course link of about 1000 controls. */
export const RUN_LIVE_COURSE_LINK_MAX = 16_000;
/** Address of the runner page in ControlFreak Run; the link's data follows `#`. */
export const RUN_LIVE_LINK_PREFIX = "https://run.controlfreak.se/live#";
/** The runner link for a competition, e.g. for a QR code on the map or at the start. */
export function runLiveLink(link) {
    return (RUN_LIVE_LINK_PREFIX +
        new URLSearchParams({ b: link.base, k: link.key }).toString());
}
/**
 * Reads the part of a runner link after `#` (with or without the `#`). Null when it is not
 * a runner link, or its address is not https.
 */
export function parseRunLiveLink(hash) {
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const base = params.get("b") ?? "";
    const key = params.get("k") ?? "";
    if (!key || key.length > 200)
        return null;
    try {
        const url = new URL(base);
        if (url.protocol !== "https:" || url.search || url.hash)
            return null;
    }
    catch {
        return null;
    }
    return { base: base.replace(/\/+$/, ""), key };
}
/**
 * The base address of a site's open courses, from the site's origin
 * (e.g. `https://live.controlfreak.se`): `{origin}{@link RUN_LIVE_OPEN_PATH}`. Used like
 * `base` of a runner link, but without a key.
 *
 * @throws {TypeError} When `origin` is not an absolute URL.
 */
export function runLiveOpenBase(origin) {
    return new URL(origin).origin + RUN_LIVE_OPEN_PATH;
}
/** Where the phone sends a runner's run: `{base}/runners/{runnerId}`. */
export function runLiveRunnerUrl(base, runnerId) {
    return `${base.replace(/\/+$/, "")}/runners/${encodeURIComponent(runnerId)}`;
}
/** A new random runner id and secret, from the browser's Web Crypto. */
export function newRunnerId() {
    const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
    return { runnerId: hex(16), secret: hex(32) };
}
/** The course link's payload (a leading `#` removed) if it may be one, else null. */
function checkCourseLink(x) {
    if (typeof x !== "string")
        return null;
    const link = x.startsWith("#") ? x.slice(1) : x;
    // The run payload alphabet, `0-9A-Z$*+-./:` (see `RUN_PAYLOAD_ALPHABET` in `run`).
    if (!link || link.length > RUN_LIVE_COURSE_LINK_MAX || !/^[0-9A-Z$*+\-./:]+$/.test(link))
        return null;
    return link;
}
const isCount = (x) => Number.isInteger(x) && x >= 0;
const isTime = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;
/**
 * Checks an upload and returns it in a clean form, or null when it is not a body of this
 * protocol. Unknown fields are dropped: the site stores only what it shows.
 *
 * The optional `club` is kept trimmed when it is a string of 1 to {@link RUN_LIVE_CLUB_MAX}
 * characters, and dropped otherwise. The optional `courseLink` is kept, without `#`, when it has only the course link's
 * characters and at most {@link RUN_LIVE_COURSE_LINK_MAX} of them, and dropped otherwise, so
 * it never costs the punches. Its course is not read here; the open address must still read
 * it (`openCourseId`).
 */
export function parseRunLiveBody(json) {
    if (typeof json !== "object" || json === null || Array.isArray(json))
        return null;
    const b = json;
    if (b.protocol !== RUN_LIVE_PROTOCOL || b.version !== RUN_LIVE_VERSION)
        return null;
    if (typeof b.runnerId !== "string" || !/^[0-9a-f]{32}$/.test(b.runnerId))
        return null;
    if (typeof b.secret !== "string" || !/^[0-9a-f]{64}$/.test(b.secret))
        return null;
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name || name.length > RUN_LIVE_NAME_MAX)
        return null;
    const course = b.course;
    if (typeof course !== "object" || course === null)
        return null;
    if (typeof course.name !== "string" || course.name.length > 100)
        return null;
    if (!Array.isArray(course.controls) || course.controls.length > MAX_CONTROLS)
        return null;
    const controls = [];
    for (const c of course.controls) {
        const control = c;
        if (!control || !isCount(control.code))
            return null;
        if (control.points !== undefined && !isCount(control.points))
            return null;
        controls.push(control.points === undefined ? { code: control.code } : { code: control.code, points: control.points });
    }
    let score = null;
    if (course.score != null) {
        const s = course.score;
        if (!isCount(s.timeLimitMinutes) || !isCount(s.penaltyPerMinute))
            return null;
        score = { timeLimitMinutes: s.timeLimitMinutes, penaltyPerMinute: s.penaltyPerMinute };
    }
    if (!isTime(b.startAt))
        return null;
    if (!Array.isArray(b.punches) || b.punches.length > MAX_CONTROLS * 2)
        return null;
    const punches = [];
    for (const p of b.punches) {
        const punch = p;
        if (!punch || !isCount(punch.index) || punch.index >= controls.length || !isTime(punch.at)) {
            return null;
        }
        punches.push({ index: punch.index, at: punch.at });
    }
    if (b.finishAt !== null && !isTime(b.finishAt))
        return null;
    const club = typeof b.club === "string" ? b.club.trim() : "";
    const courseLink = checkCourseLink(b.courseLink);
    const body = {
        protocol: RUN_LIVE_PROTOCOL,
        version: RUN_LIVE_VERSION,
        runnerId: b.runnerId,
        secret: b.secret,
        name,
        course: { name: course.name, controls, score },
        startAt: b.startAt,
        punches,
        finishAt: b.finishAt,
        generatedAt: typeof b.generatedAt === "string" ? b.generatedAt.slice(0, 40) : "",
    };
    if (club && club.length <= RUN_LIVE_CLUB_MAX)
        body.club = club;
    if (courseLink)
        body.courseLink = courseLink;
    return body;
}
function rowFor(body) {
    const { controls, score } = body.course;
    const firstAt = new Map();
    for (const p of body.punches)
        if (!firstAt.has(p.index))
            firstAt.set(p.index, p.at);
    const time = body.finishAt === null ? null : Math.max(0, body.finishAt - body.startAt);
    let points = null;
    if (score) {
        let sum = 0;
        for (const i of firstAt.keys())
            sum += controls[i]?.points ?? 0;
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
        taken: firstAt.size,
        splits: score ? [] : controls.map((_, i) => (firstAt.has(i) ? firstAt.get(i) - body.startAt : null)),
        points,
        complete: score ? true : firstAt.size === controls.length,
        lastAt: Math.max(lastPunch, body.finishAt ?? 0),
    };
}
/**
 * The standings, one entry per course name, courses in name order. Finished runners with a
 * complete run come first, by points (score) and time; then the runners still out, by how
 * many controls they have taken and how early they took the last one; then those who
 * finished without every control.
 */
export function runLiveStandings(bodies) {
    const byCourse = new Map();
    for (const body of bodies) {
        let course = byCourse.get(body.course.name);
        if (!course) {
            course = { name: body.course.name, controls: body.course.controls, score: body.course.score, rows: [] };
            byCourse.set(body.course.name, course);
        }
        course.rows.push(rowFor(body));
    }
    const group = (r) => (r.status === "finished" ? (r.complete ? 0 : 2) : 1);
    for (const course of byCourse.values()) {
        course.rows.sort((a, b) => group(a) - group(b) ||
            (b.points ?? 0) - (a.points ?? 0) ||
            (group(a) === 1 ? b.taken - a.taken || a.lastAt - b.lastAt : (a.time ?? 0) - (b.time ?? 0)) ||
            a.name.localeCompare(b.name));
        let place = 0;
        let prev = null;
        course.rows.forEach((r, i) => {
            if (group(r) !== 0)
                return;
            if (!prev || prev.time !== r.time || prev.points !== r.points)
                place = i + 1;
            r.place = place;
            prev = r;
        });
    }
    return [...byCourse.values()].sort((a, b) => a.name.localeCompare(b.name));
}
