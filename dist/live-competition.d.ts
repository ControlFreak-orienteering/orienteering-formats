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
 * `publish` (since v0.21.0) asks the site to make the results public or hidden; the answer's
 * `published` says which it is. Absent `publish`: a new competition is hidden, an existing one
 * is unchanged.
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
    /**
     * Whether the competition's results are public on the site (since v0.21.0). Absent: a new
     * competition is made hidden and an existing one keeps its setting.
     */
    publish?: boolean;
}
/** A course the site left in another competition. */
export interface LiveCompetitionTaken {
    /** The course's name. */
    course: string;
    /** The name of the other competition that holds it. */
    competition: string;
    /** True when that competition has an owner on the site (since v0.20.0). */
    owned?: boolean;
}
/** The body of a `409` answer. */
export interface LiveCompetitionConflict {
    /** `"all courses taken"` or `"owner changed"`. */
    error: string;
    /** For `"all courses taken"`: where each course is (since v0.20.0); empty when not sent. */
    taken: LiveCompetitionTaken[];
}
/** What the site did: made a new competition, replaced the courses of one, or added to it. */
export type LiveCompetitionOutcome = "created" | "replaced" | "added";
/** The site's answer to a request. */
export interface LiveCompetitionResponse {
    /** The competition's id. */
    id: string;
    /** The link to the competition's page. */
    url: string;
    /**
     * The admin code, {@link LIVE_COMPETITION_CODE_LENGTH} characters of
     * {@link LIVE_COMPETITION_CODE_ALPHABET}. Missing when the competition has an owner on the
     * site (since v0.20.0; v0.19.0 required it, but no released app read it). The site no
     * longer sends it.
     */
    code?: string;
    /**
     * True when the competition has an owner on the site after the request (since v0.20.0).
     * Missing from older sites.
     */
    owned?: boolean;
    /**
     * True when the competition's results are public on the site after the request (since
     * v0.21.0). Missing from older sites.
     */
    published?: boolean;
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
 * `publish` is put in the request only when given: true makes the results public, false hides
 * them; left out, a new competition is hidden and an existing one is unchanged.
 */
export declare function liveCompetitionRequest(name: string, courses: readonly string[], publish?: boolean): LiveCompetitionRequest | null;
/** Reads a request body with the same rules as {@link liveCompetitionRequest}; null if it is not one. */
export declare function parseLiveCompetitionRequest(x: unknown): LiveCompetitionRequest | null;
/** Reads the site's answer; null if it is not one. Unknown fields are dropped. */
export declare function parseLiveCompetitionResponse(x: unknown): LiveCompetitionResponse | null;
/**
 * Reads the body of a `409` answer; null if it is not one. A missing or unreadable `taken`
 * (older sites) reads as empty.
 */
export declare function parseLiveCompetitionConflict(x: unknown): LiveCompetitionConflict | null;
/**
 * Reads an admin code as a person types it: trimmed and in capitals. Null unless it is
 * {@link LIVE_COMPETITION_CODE_LENGTH} characters of {@link LIVE_COMPETITION_CODE_ALPHABET}.
 */
export declare function normaliseLiveCompetitionCode(s: string): string | null;
/** The address to `POST` a request to, on the site at `origin` (any path on it is ignored). Throws on a bad URL. */
export declare function liveCompetitionEndpoint(origin: string): string;
/** Path of the page on a ControlFreak Live site where a user links an app to an account. */
export declare const LIVE_LINK_PATH = "/koppla";
/** The apps that can be linked to a Live account. */
export type LiveLinkApp = "run" | "course";
/**
 * The address of the link page on the site at `origin` (any path on it is ignored), for the
 * app `app` running at `returnOrigin`, the origin the page sends its message to. Throws on a
 * bad `origin`.
 */
export declare function liveLinkUrl(origin: string, app: LiveLinkApp, returnOrigin: string): string;
/** The message the link page posts to the app that opened it, once the user has linked. */
export interface LiveLinkMessage {
    /** Always `"cf-live-link"`. */
    type: "cf-live-link";
    /** Always 1. */
    v: 1;
    /** The app that is linked. */
    app: LiveLinkApp;
    /** The account's key, 43 characters of base64url. A secret: never log it or put it in a URL. */
    key: string;
    /** The account's e-mail address, to show the user which account is linked. */
    account: string;
}
/** Builds the message the link page posts for `app`, the account's `key` and e-mail `account`. */
export declare function liveLinkMessage(app: LiveLinkApp, key: string, account: string): LiveLinkMessage;
/**
 * Reads a link message; null if it is not one: wrong type, version or app, a key that is not
 * 43 characters of base64url, or an account that is not a text of 1 to 254 characters.
 * Unknown fields are dropped. The caller must also check the sender's origin.
 */
export declare function parseLiveLinkMessage(x: unknown): LiveLinkMessage | null;
/** The headers of a request: JSON, and `Authorization: Bearer <key>` when the app is linked. */
export declare function liveCompetitionHeaders(key: string | null): Record<string, string>;
/**
 * Site side: the key in an `Authorization` header (`Bearer <key>`), or null when the header
 * is missing or is not a well-formed key.
 */
export declare function parseLiveCompetitionKey(authorization: string | null): string | null;
