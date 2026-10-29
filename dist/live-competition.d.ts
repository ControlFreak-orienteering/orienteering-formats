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
export declare const LIVE_COMPETITION_VERSION = 1;
/** Path of the address on a ControlFreak Live site that takes the request. */
export declare const LIVE_COMPETITION_PATH = "/api/public/cf-competition";
/** The longest competition name, in characters. */
export declare const LIVE_COMPETITION_NAME_MAX = 120;
/** Most courses a request may hold. */
export declare const LIVE_COMPETITION_COURSES_MAX = 100;
/** The characters of an admin code: capitals and digits without I, L, O, 0 and 1. */
export declare const LIVE_COMPETITION_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** The length of an admin code. */
export declare const LIVE_COMPETITION_CODE_LENGTH = 4;
/** The request body: a competition's name and its courses. */
export interface LiveCompetitionRequest {
    /** Always {@link LIVE_COMPETITION_VERSION}. */
    v: 1;
    /** The competition's name, 1 to {@link LIVE_COMPETITION_NAME_MAX} characters. */
    name: string;
    /** Each course as the data of a Run course link, the text after the `#`. */
    courses: string[];
}
/** A course the site left in another competition. */
export interface LiveCompetitionTaken {
    /** The course's name. */
    course: string;
    /** The name of the other competition that holds it. */
    competition: string;
}
/** What the site did: made a new competition, replaced the courses of one, or added to it. */
export type LiveCompetitionOutcome = "created" | "replaced" | "added";
/** The site's answer to a request. */
export interface LiveCompetitionResponse {
    /** The competition's id. */
    id: string;
    /** The link to the competition's page. */
    url: string;
    /** The admin code, {@link LIVE_COMPETITION_CODE_LENGTH} characters of {@link LIVE_COMPETITION_CODE_ALPHABET}. */
    code: string;
    /** What the site did. */
    outcome: LiveCompetitionOutcome;
    /** Courses left in other competitions; empty when none. */
    taken: LiveCompetitionTaken[];
}
/**
 * Builds a request. Each course may be a whole Run link or only its data: everything up to
 * and including the first `#` is cut, the rest trimmed, empty ones dropped and repeats
 * removed (first kept). A name longer than {@link LIVE_COMPETITION_NAME_MAX} is cut.
 * Returns null for an empty name, no courses, or more than {@link LIVE_COMPETITION_COURSES_MAX}.
 */
export declare function liveCompetitionRequest(name: string, courses: readonly string[]): LiveCompetitionRequest | null;
/** Reads a request body with the same rules as {@link liveCompetitionRequest}; null if it is not one. */
export declare function parseLiveCompetitionRequest(x: unknown): LiveCompetitionRequest | null;
/** Reads the site's answer; null if it is not one. Unknown fields are dropped. */
export declare function parseLiveCompetitionResponse(x: unknown): LiveCompetitionResponse | null;
/**
 * Reads an admin code as a person types it: trimmed and in capitals. Null unless it is
 * {@link LIVE_COMPETITION_CODE_LENGTH} characters of {@link LIVE_COMPETITION_CODE_ALPHABET}.
 */
export declare function normaliseLiveCompetitionCode(s: string): string | null;
/** The address to `POST` a request to, on the site at `origin` (any path on it is ignored). Throws on a bad URL. */
export declare function liveCompetitionEndpoint(origin: string): string;
