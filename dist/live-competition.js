/**
 * Competitions on ControlFreak Live made from QR codes ("cf-competition"): how ControlFreak
 * Run and ControlFreak Course create or update a competition on the site without a login,
 * and what the site answers.
 *
 * The client sends one `POST` with a JSON {@link LiveCompetitionRequest} to
 * `{origin}{@link LIVE_COMPETITION_PATH}` ({@link liveCompetitionEndpoint}): the
 * competition's name and its courses, each as the data of a Run course link (the text after
 * the `#` of `https://run.controlfreak.se/#<payload>`). The site reads the courses from them.
 * The site answers `200` with a {@link LiveCompetitionResponse}: the competition's id, its
 * link, a short **admin code** and what it did ({@link LiveCompetitionOutcome}). The admin
 * code ({@link normaliseLiveCompetitionCode}) lets the organiser come back and change the
 * competition without an account. Courses that already belong to another competition are
 * left there and listed in `taken`.
 *
 * Other answers: `400` not a request of this protocol, `429` too many new competitions from
 * this address, `500` the site failed. CORS as in cf-live, so a browser app may call it.
 *
 * Within version 1, only optional fields are added; anything else is a new version.
 * This module imports nothing, like `cf-live`.
 */
/** The version this module writes and reads. */
export const LIVE_COMPETITION_VERSION = 1;
/** Path of the address on a ControlFreak Live site that takes the request. */
export const LIVE_COMPETITION_PATH = "/api/public/cf-competition";
/** The longest competition name, in characters. */
export const LIVE_COMPETITION_NAME_MAX = 120;
/** Most courses a request may hold. */
export const LIVE_COMPETITION_COURSES_MAX = 100;
/** The characters of an admin code: capitals and digits without I, L, O, 0 and 1. */
export const LIVE_COMPETITION_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** The length of an admin code. */
export const LIVE_COMPETITION_CODE_LENGTH = 4;
const OUTCOMES = ["created", "replaced", "added"];
function isRecord(x) {
    return typeof x === "object" && x !== null && !Array.isArray(x);
}
/** Cuts the text up to and including the first `#`, trims, and drops what is left empty. */
function courseData(s) {
    const i = s.indexOf("#");
    return (i >= 0 ? s.slice(i + 1) : s).trim();
}
/** The shared rules of the builder and the reader. */
function normalised(name, courses) {
    const n = name.trim().slice(0, LIVE_COMPETITION_NAME_MAX).trim();
    if (!n)
        return null;
    const seen = new Set();
    for (const c of courses) {
        const d = courseData(c);
        if (d)
            seen.add(d);
    }
    if (seen.size === 0 || seen.size > LIVE_COMPETITION_COURSES_MAX)
        return null;
    return { v: LIVE_COMPETITION_VERSION, name: n, courses: [...seen] };
}
/**
 * Builds a request. Each course may be a whole Run link or only its data: everything up to
 * and including the first `#` is cut, the rest trimmed, empty ones dropped and repeats
 * removed (first kept). A name longer than {@link LIVE_COMPETITION_NAME_MAX} is cut.
 * Returns null for an empty name, no courses, or more than {@link LIVE_COMPETITION_COURSES_MAX}.
 */
export function liveCompetitionRequest(name, courses) {
    return normalised(name, courses);
}
/** Reads a request body with the same rules as {@link liveCompetitionRequest}; null if it is not one. */
export function parseLiveCompetitionRequest(x) {
    if (!isRecord(x) || x.v !== LIVE_COMPETITION_VERSION)
        return null;
    if (typeof x.name !== "string" || !Array.isArray(x.courses))
        return null;
    if (!x.courses.every((c) => typeof c === "string"))
        return null;
    return normalised(x.name, x.courses);
}
/** Reads the site's answer; null if it is not one. Unknown fields are dropped. */
export function parseLiveCompetitionResponse(x) {
    if (!isRecord(x))
        return null;
    const { id, url, code, outcome, taken } = x;
    if (typeof id !== "string" || !id || typeof url !== "string" || !url)
        return null;
    if (typeof code !== "string" || normaliseLiveCompetitionCode(code) !== code)
        return null;
    if (typeof outcome !== "string" || !OUTCOMES.includes(outcome))
        return null;
    if (!Array.isArray(taken))
        return null;
    const list = [];
    for (const t of taken) {
        if (!isRecord(t) || typeof t.course !== "string" || typeof t.competition !== "string")
            return null;
        list.push({ course: t.course, competition: t.competition });
    }
    return { id, url, code, outcome: outcome, taken: list };
}
/**
 * Reads an admin code as a person types it: trimmed and in capitals. Null unless it is
 * {@link LIVE_COMPETITION_CODE_LENGTH} characters of {@link LIVE_COMPETITION_CODE_ALPHABET}.
 */
export function normaliseLiveCompetitionCode(s) {
    const c = s.trim().toUpperCase();
    if (c.length !== LIVE_COMPETITION_CODE_LENGTH)
        return null;
    for (const ch of c)
        if (!LIVE_COMPETITION_CODE_ALPHABET.includes(ch))
            return null;
    return c;
}
/** The address to `POST` a request to, on the site at `origin` (any path on it is ignored). Throws on a bad URL. */
export function liveCompetitionEndpoint(origin) {
    return new URL(origin).origin + LIVE_COMPETITION_PATH;
}
