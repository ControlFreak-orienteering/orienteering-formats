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
 * `club`, `courseLink` and `startedAt` are optional fields within version 1: a body without
 * them is as valid as before, and a site that does not know them drops them.
 *
 * This module imports nothing, like `cf-live`. The id of a course's page needs the
 * course link reader, so it lives in `orienteering-formats/run` (`openCourseId`).
 */
/** The protocol's name, in every body. */
export declare const RUN_LIVE_PROTOCOL = "cf-run-live";
/** The version this module writes and reads. */
export declare const RUN_LIVE_VERSION = 1;
/** The longest name a runner may give, in characters. */
export declare const RUN_LIVE_NAME_MAX = 60;
/** The longest club a runner may give, in characters. */
export declare const RUN_LIVE_CLUB_MAX = 60;
/**
 * Path of the keyless address on a ControlFreak Live site, for runs on any course without a
 * competition: the phone sends to `{origin}/api/public/cf-run/open/runners/{runnerId}`.
 */
export declare const RUN_LIVE_OPEN_PATH = "/api/public/cf-run/open";
/** Longest `courseLink` kept, in characters: a course link of about 1000 controls. */
export declare const RUN_LIVE_COURSE_LINK_MAX = 16000;
/** Address of the runner page in ControlFreak Run; the link's data follows `#`. */
export declare const RUN_LIVE_LINK_PREFIX = "https://run.controlfreak.se/live#";
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
        score: {
            timeLimitMinutes: number;
            penaltyPerMinute: number;
        } | null;
    };
    /** The start, ms since 1970. */
    startAt: number;
    /**
     * When the start beep sounded on the phone, ms since 1970, or null while the runner is
     * ready but has not started (the phone sends the run as soon as the runner is ready, before
     * `startAt`). Absent from senders that do not report it; their runners count as started.
     * Optional field within version 1 (since v0.17.0). See {@link runLiveAbandoned}.
     */
    startedAt?: number | null;
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
export declare function runLiveLink(link: RunLiveLink): string;
/**
 * Reads the part of a runner link after `#` (with or without the `#`). Null when it is not
 * a runner link, or its address is not https.
 */
export declare function parseRunLiveLink(hash: string): RunLiveLink | null;
/**
 * The base address of a site's courses (runs without a competition), from the site's origin
 * (e.g. `https://live.controlfreak.se`): `{origin}{@link RUN_LIVE_OPEN_PATH}`. Used like
 * `base` of a runner link, but without a key.
 *
 * @throws {TypeError} When `origin` is not an absolute URL.
 */
export declare function runLiveOpenBase(origin: string): string;
/** Where the phone sends a runner's run: `{base}/runners/{runnerId}`. */
export declare function runLiveRunnerUrl(base: string, runnerId: string): string;
/** A new random runner id and secret, from the browser's Web Crypto. */
export declare function newRunnerId(): {
    runnerId: string;
    secret: string;
};
/**
 * Checks an upload and returns it in a clean form, or null when it is not a body of this
 * protocol. Unknown fields are dropped: the site stores only what it shows.
 *
 * The optional `club` is kept trimmed when it is a string of 1 to {@link RUN_LIVE_CLUB_MAX}
 * characters, and dropped otherwise. The optional `courseLink` is kept, without `#`, when it has only the course link's
 * characters and at most {@link RUN_LIVE_COURSE_LINK_MAX} of them, and dropped otherwise, so
 * it never costs the punches. Its course is not read here; the keyless address must still read
 * it (`openCourseId`). The optional `startedAt` is kept when it is null or a time, and dropped
 * otherwise.
 */
export declare function parseRunLiveBody(json: unknown): RunLiveBody | null;
/** A runner's row in the standings. Times are ms since the runner's start. */
export interface RunLiveRow {
    runnerId: string;
    name: string;
    /** The club the runner gave, or null. */
    club: string | null;
    /** `finished` once the phone has sent the finish, else `running`. */
    status: "running" | "finished";
    /**
     * Whether the start beep has sounded (or the runner punched or finished). False while the
     * runner is only ready; true for senders that do not report it (no `startedAt`).
     */
    started: boolean;
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
 * Whether the runner has started: the start beep sounded on the phone, or the runner punched
 * or finished. A sender without `startedAt` counts as started, as before v0.17.0.
 */
export declare function runLiveStarted(body: RunLiveBody): boolean;
/**
 * How long after `startAt` a site waits for the start beep ({@link RunLiveBody.startedAt})
 * before it treats the run as abandoned: long enough for an upload delayed by poor coverage.
 */
export declare const RUN_LIVE_START_GRACE_MS: number;
/**
 * Whether a run was abandoned before the start: the runner was ready, but the start beep has
 * not come {@link RUN_LIVE_START_GRACE_MS} after the start time (`now`, ms since 1970). The
 * runner gave up, ran another course or never ran; a site leaves such runs out of the
 * standings. A later upload with the start beep brings the run back.
 */
export declare function runLiveAbandoned(body: RunLiveBody, now: number): boolean;
/**
 * The standings, one entry per course name, courses in name order. Finished runners with a
 * complete run come first, by points (score) and time; then the runners still out, by how
 * many controls they have taken and how early they took the last one; then those who are
 * ready but have not started (see {@link RunLiveRow.started}), by start time; then those who
 * finished without every control. Abandoned runs ({@link runLiveAbandoned}) are the
 * caller's to leave out, since that depends on the time.
 */
export declare function runLiveStandings(bodies: readonly RunLiveBody[]): RunLiveCourse[];
