/**
 * Live punches from ControlFreak Run ("cf-run-live"): how the runner's phone sends its run
 * to a ControlFreak Live competition while the runner is out, and how the site shows it.
 *
 * The organiser creates the competition on the site, which gives a **runner link**
 * ({@link runLiveLink}). A runner who opens it before the start has the phone send the run:
 * the name the runner gave, the course's name and control codes, the start, every punch
 * and the finish. Never the track or any position.
 *
 * The phone sends the whole run each time, so a lost upload is mended by the next:
 * - `PUT {base}/runners/{runnerId}` with `Authorization: Bearer <runner key>` and a
 *   {@link RunLiveBody}. `{base}` and the key come from the runner link; the key is the
 *   same for every runner of the competition, since it is printed or shared openly.
 * - `runnerId` and `secret` are made by the phone for each run ({@link newRunnerId}). The
 *   site keeps a hash of the secret from the first upload and refuses a later upload for
 *   the same runner with another secret (`403`), so one runner cannot overwrite another.
 * - Answers: `204` stored, `400` not a body of this protocol, `401` wrong key, `403` wrong
 *   secret, `404` no such competition, `413` too large. CORS as in cf-live.
 *
 * This module imports nothing, like `cf-live`.
 */
/** The protocol's name, in every body. */
export declare const RUN_LIVE_PROTOCOL = "cf-run-live";
/** The version this module writes and reads. */
export declare const RUN_LIVE_VERSION = 1;
/** The longest name a runner may give, in characters. */
export declare const RUN_LIVE_NAME_MAX = 60;
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
    /** Punches in the order they were made. */
    punches: RunLivePunch[];
    /** The finish, ms since 1970, or null while the runner is out. */
    finishAt: number | null;
    /** When the phone made the body, ISO 8601. */
    generatedAt: string;
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
/** A new random runner id and secret, from the browser's Web Crypto. */
export declare function newRunnerId(): {
    runnerId: string;
    secret: string;
};
/**
 * Checks an upload and returns it in a clean form, or null when it is not a body of this
 * protocol. Unknown fields are dropped: the site stores only what it shows.
 */
export declare function parseRunLiveBody(json: unknown): RunLiveBody | null;
/** A runner's row in the standings. Times are ms since the runner's start. */
export interface RunLiveRow {
    runnerId: string;
    name: string;
    /** `finished` once the phone has sent the finish, else `running`. */
    status: "running" | "finished";
    /** Place among the finished on the course (1, 2 …), or null while running or when not complete. */
    place: number | null;
    /** Running time to the finish, or null while running. */
    time: number | null;
    /** Controls punched (each control once). */
    taken: number;
    /** On a fixed-order course: the time at each control, in course order, or null if not punched. */
    splits: (number | null)[];
    /** On a score course: points after the penalty, else null. */
    points: number | null;
    /** On a fixed-order course: every control punched. Always true on a score course. */
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
 * The standings, one entry per course name, courses in name order. Finished runners with a
 * complete run come first, by points (score) and time; then the runners still out, by how
 * many controls they have taken and how early they took the last one; then those who
 * finished without every control.
 */
export declare function runLiveStandings(bodies: readonly RunLiveBody[]): RunLiveCourse[];
