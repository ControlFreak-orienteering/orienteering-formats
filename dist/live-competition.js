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
 * link, whether it has an owner on the site, and what it did ({@link LiveCompetitionOutcome}).
 * A competition without an owner may be changed by anyone who sends the same name with starts
 * close by; a signed-in user takes it over on the site. Only the owner changes an owned one.
 * `publish` (since v0.20.0) asks the site to make the results public or hidden; the answer's
 * `published` says which it is. Absent `publish`: a new competition is hidden, an existing one
 * is unchanged.
 * `organiser` and `date` (since v0.22.0) give the organising club and the competition's
 * first day (`YYYY-MM-DD`). The site sets the organiser on a new competition and on an
 * existing one when given, and the date on a new competition and on one without a date (a
 * date set at the first start or by the owner stays). Absent: unchanged.
 * Courses that already belong to another competition are left there and listed in `taken`.
 * The site no longer sends an admin code (since v0.20.0); the code fields stay for v0.19.0
 * readers.
 *
 * Other answers: `400` not a request of this protocol, `409` every course is taken by other
 * competitions (`{"error":"all courses taken","taken":[…]}`, read with
 * {@link parseLiveCompetitionConflict}; `taken` since v0.20.0), or the competition got an owner while the request was running ("owner
 * changed"), `413` the body is too large, `429` too many new competitions from this
 * address, `500` the site failed. CORS as in cf-live, so a browser app may call it.
 *
 * Linked accounts (since v0.20.0): an app may send the **key** of a ControlFreak Live account
 * as `Authorization: Bearer <key>` ({@link liveCompetitionHeaders}); the site reads it with
 * {@link parseLiveCompetitionKey}. A competition made with a key belongs to that account.
 * A key the site does not know (or no longer knows) gets `401 {"error":"unknown key"}`: the
 * app forgets the key and may retry once without it. The app gets the key by opening
 * {@link liveLinkUrl} on the site: the page signs the user in and answers the opener with a
 * {@link LiveLinkMessage} through `postMessage`.
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
/** The longest organiser, in characters. */
export const LIVE_COMPETITION_ORGANISER_MAX = 120;
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
/** True for `YYYY-MM-DD` that is a day in the calendar. */
function isDay(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m)
        return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.toISOString().slice(0, 10) === s;
}
/** The shared rules of the builder and the reader. */
function normalised(name, courses, publish, details = {}) {
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
    const request = { v: LIVE_COMPETITION_VERSION, name: n, courses: [...seen] };
    if (publish !== undefined)
        request.publish = publish;
    const organiser = details.organiser?.trim().slice(0, LIVE_COMPETITION_ORGANISER_MAX).trim();
    if (organiser)
        request.organiser = organiser;
    const date = details.date?.trim();
    if (date && isDay(date))
        request.date = date;
    return request;
}
/**
 * Builds a request. Each course may be a whole Run link or only its data: everything up to
 * and including the first `#` is cut, the rest trimmed, empty ones dropped and repeats
 * removed (first kept). A name longer than {@link LIVE_COMPETITION_NAME_MAX} is cut.
 * Returns null for an empty name, no courses, or more than {@link LIVE_COMPETITION_COURSES_MAX}.
 * `publish` is put in the request only when given: true makes the results public, false hides
 * them; left out, a new competition is hidden and an existing one is unchanged.
 * `details` (since v0.22.0) adds the organiser and the date when they are usable.
 */
export function liveCompetitionRequest(name, courses, publish, details) {
    return normalised(name, courses, publish, details);
}
/**
 * Reads a request body with the same rules as {@link liveCompetitionRequest}; null if it is not
 * one. An `organiser` or `date` that is not usable is dropped, not refused.
 */
export function parseLiveCompetitionRequest(x) {
    if (!isRecord(x) || x.v !== LIVE_COMPETITION_VERSION)
        return null;
    if (typeof x.name !== "string" || !Array.isArray(x.courses))
        return null;
    if (!x.courses.every((c) => typeof c === "string"))
        return null;
    if (x.publish !== undefined && typeof x.publish !== "boolean")
        return null;
    return normalised(x.name, x.courses, x.publish, {
        ...(typeof x.organiser === "string" ? { organiser: x.organiser } : {}),
        ...(typeof x.date === "string" ? { date: x.date } : {}),
    });
}
/** Reads the site's answer; null if it is not one. Unknown fields are dropped. */
export function parseLiveCompetitionResponse(x) {
    if (!isRecord(x))
        return null;
    const { id, url, code, owned, published, outcome, taken } = x;
    if (typeof id !== "string" || !id || typeof url !== "string" || !url)
        return null;
    if (code !== undefined && (typeof code !== "string" || normaliseLiveCompetitionCode(code) !== code)) {
        return null;
    }
    if (owned !== undefined && typeof owned !== "boolean")
        return null;
    if (published !== undefined && typeof published !== "boolean")
        return null;
    if (typeof outcome !== "string" || !OUTCOMES.includes(outcome))
        return null;
    if (!Array.isArray(taken))
        return null;
    const list = parseTaken(taken);
    if (!list)
        return null;
    const response = { id, url, outcome: outcome, taken: list };
    if (code !== undefined)
        response.code = code;
    if (owned !== undefined)
        response.owned = owned;
    if (published !== undefined)
        response.published = published;
    return response;
}
function parseTaken(taken) {
    const list = [];
    for (const t of taken) {
        if (!isRecord(t) || typeof t.course !== "string" || typeof t.competition !== "string")
            return null;
        if (t.owned !== undefined && typeof t.owned !== "boolean")
            return null;
        const item = { course: t.course, competition: t.competition };
        if (t.owned !== undefined)
            item.owned = t.owned;
        list.push(item);
    }
    return list;
}
/**
 * Reads the body of a `409` answer; null if it is not one. A missing or unreadable `taken`
 * (older sites) reads as empty.
 */
export function parseLiveCompetitionConflict(x) {
    if (!isRecord(x) || typeof x.error !== "string" || !x.error)
        return null;
    const taken = Array.isArray(x.taken) ? parseTaken(x.taken) : null;
    return { error: x.error, taken: taken ?? [] };
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
/** Path of the page on a ControlFreak Live site where a user links an app to an account. */
export const LIVE_LINK_PATH = "/koppla";
/** What a link key looks like: 32 random bytes as base64url without padding. */
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** The longest account name (an e-mail address) in a link message, in characters. */
const ACCOUNT_MAX = 254;
/**
 * The address of the link page on the site at `origin` (any path on it is ignored), for the
 * app `app` running at `returnOrigin`, the origin the page sends its message to. Throws on a
 * bad `origin`.
 */
export function liveLinkUrl(origin, app, returnOrigin) {
    return `${new URL(origin).origin}${LIVE_LINK_PATH}?app=${app}&origin=${encodeURIComponent(returnOrigin)}`;
}
/** Builds the message the link page posts for `app`, the account's `key` and e-mail `account`. */
export function liveLinkMessage(app, key, account) {
    return { type: "cf-live-link", v: 1, app, key, account };
}
/**
 * Reads a link message; null if it is not one: wrong type, version or app, a key that is not
 * 43 characters of base64url, or an account that is not a text of 1 to 254 characters.
 * Unknown fields are dropped. The caller must also check the sender's origin.
 */
export function parseLiveLinkMessage(x) {
    if (!isRecord(x) || x.type !== "cf-live-link" || x.v !== 1)
        return null;
    if (x.app !== "run" && x.app !== "course")
        return null;
    if (typeof x.key !== "string" || !KEY_PATTERN.test(x.key))
        return null;
    if (typeof x.account !== "string" || x.account.length < 1 || x.account.length > ACCOUNT_MAX)
        return null;
    return liveLinkMessage(x.app, x.key, x.account);
}
/** The headers of a request: JSON, and `Authorization: Bearer <key>` when the app is linked. */
export function liveCompetitionHeaders(key) {
    const headers = { "Content-Type": "application/json" };
    if (key)
        headers.Authorization = "Bearer " + key;
    return headers;
}
/**
 * Site side: the key in an `Authorization` header (`Bearer <key>`), or null when the header
 * is missing or is not a well-formed key.
 */
export function parseLiveCompetitionKey(authorization) {
    if (!authorization?.startsWith("Bearer "))
        return null;
    const key = authorization.slice(7);
    return KEY_PATTERN.test(key) ? key : null;
}
