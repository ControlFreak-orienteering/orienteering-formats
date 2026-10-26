/**
 * The ControlFreak Live protocol ("cf-live"): how a timing app (ControlFreak Event) sends
 * live results to a results site that an organiser runs, built by anyone, often from the
 * prompt ControlFreak Event gives.
 *
 * Both sides use this module: the app to read what a site supports and to build delta
 * uploads, the site to check and apply uploads. It has no imports, so a site can load the
 * built file on its own, e.g. a Supabase edge function from
 * `https://cdn.jsdelivr.net/gh/ControlFreak-orienteering/orienteering-formats@v<tag>/dist/cf-live.js`.
 *
 * **Compatibility.** Sites are built once and often never rebuilt, so an app must keep
 * talking to every site ever built:
 * - Within a protocol version, later releases only add optional fields. Readers ignore
 *   fields they do not know, and must treat an added field as missing on older sites.
 * - A change that an older site would misread gets a new protocol version. A site lists the
 *   versions it speaks in `info`; the app picks the highest one both speak, and keeps every
 *   older version it has ever spoken in {@link CF_LIVE_VERSIONS}.
 * - `info.prompt` says which version of the prompt the site was built from (absent on sites
 *   built before it was added: prompt 1). It is for telling the organiser that a newer
 *   prompt exists; the protocol never depends on it.
 *
 * The site has two addresses below its base address `{base}`:
 * - `GET {base}/info` answers {@link CfLiveInfo} as JSON, without a key.
 * - `PUT {base}/snapshot` takes a body ({@link CfLiveBody}), with
 *   `Authorization: Bearer <upload key>` and, when compressed, `Content-Encoding: gzip`.
 * The full description, with status codes and CORS, is `docs/custom-live/protocol.md` in
 * ControlFreak Event.
 */
/** The protocol's name, in every body and in `info`. */
export declare const CF_LIVE_PROTOCOL = "cf-live";
/**
 * Every protocol version this module speaks, oldest first. Never remove one: sites built
 * for it may still be running.
 */
export declare const CF_LIVE_VERSIONS: readonly number[];
/**
 * The version of the site-building prompt that matches this module. A site built from it
 * answers it as `info.prompt`. Raise it whenever the prompt changes in a way the organiser
 * would want to rebuild for, and say what changed in {@link CF_LIVE_PROMPT_CHANGES}.
 */
export declare const CF_LIVE_PROMPT_VERSION = 2;
/**
 * What each prompt version added, in English, for developers and changelogs. The app says
 * in its own words what an organiser gains by rebuilding.
 */
export declare const CF_LIVE_PROMPT_CHANGES: Readonly<Record<number, string>>;
/** Upload modes: `full` sends the whole competition, `delta` only changed classes. */
export type CfLiveMode = "full" | "delta";
/** Body encodings: `identity` is plain JSON, `gzip` is compressed. */
export type CfLiveEncoding = "identity" | "gzip";
/** What a site supports, from `GET {base}/info`. */
export interface CfLiveInfo {
    /** The protocol versions the site speaks. */
    versions: number[];
    /** Always holds `"full"`; `"delta"` when the site takes uploads of changed classes. */
    modes: string[];
    /** Always holds `"identity"`; `"gzip"` when the site takes compressed uploads. */
    encodings: string[];
    /** The prompt version the site was built from; 1 when the site does not say. */
    prompt: number;
}
/** The competition, in every body. */
export interface CfLiveCompetition {
    /** The app's id for the competition; a site may hold several, one per id. */
    id: string;
    name: string;
    /** "2026-04-18". */
    date: string;
    organiser: string;
    /** IANA time zone, e.g. "Europe/Stockholm". */
    timeZone: string;
}
/** A radio control of a class: named as that class's course names it. */
export interface CfLiveRadioControl {
    /** Unique within the class only. */
    id: string;
    /** The control's punch code. The same code may have different names in different classes. */
    code: number;
    /** E.g. "2,3 km" or "Radio 50". */
    name: string;
}
/** A runner's time at a radio control. */
export interface CfLiveRadioTime {
    /** The class's radio control (`CfLiveRadioControl.id`). */
    id: string;
    /** Seconds since the runner's start. */
    time: number | null;
    timeText: string;
    place: number | null;
}
/** One row of a class's results, ready to show. */
export interface CfLiveResult {
    runnerId: string;
    /** 1, 2 … or null when not placed. */
    place: number | null;
    name: string;
    club: string;
    /** `OK`, `MP`, `DNF`, `DNS`, `DQ`, `MAX`, `NT`, `OC`, `CANCEL`, or `ACTIVE` while still out. */
    status: string;
    /** The status in the competition's language, ready to show. */
    statusText: string;
    /** Running time in whole seconds, or null. */
    time: number | null;
    timeText: string;
    /** Seconds behind the winner, or null. */
    behind: number | null;
    behindText: string;
    /** Points on a score course, else null. */
    points: number | null;
    radio: CfLiveRadioTime[];
}
/** One row of a class's start list. */
export interface CfLiveStart {
    runnerId: string;
    name: string;
    club: string;
    /** Clock time in the competition's time zone, e.g. "10:02:00", or "" when not drawn. */
    startTimeText: string;
}
/** A class with its results and start list. */
export interface CfLiveClass {
    id: string;
    name: string;
    /** Display order, from 0. */
    order: number;
    course: {
        name: string;
        lengthMeters: number | null;
        climbMeters: number | null;
    } | null;
    radioControls: CfLiveRadioControl[];
    results?: CfLiveResult[];
    startList?: CfLiveStart[];
}
/** Fields every body has. */
interface CfLiveBodyBase {
    protocol: typeof CF_LIVE_PROTOCOL;
    version: number;
    /** Upload number, rising by one per upload of the competition; restarts with the app. */
    sequence: number;
    /** ISO 8601 with offset. */
    generatedAt: string;
    competition: CfLiveCompetition;
}
/** The whole competition. The site replaces what it holds for it. */
export interface CfLiveFullBody extends CfLiveBodyBase {
    kind: "full";
    classes: CfLiveClass[];
}
/** Only the classes that changed since upload `baseSequence`, each whole. */
export interface CfLiveDeltaBody extends CfLiveBodyBase {
    kind: "delta";
    baseSequence: number;
    classes: CfLiveClass[];
    removedClassIds: string[];
}
/** A test: checked and answered, never stored. */
export interface CfLiveTestBody extends CfLiveBodyBase {
    kind: "test";
    classes: [];
}
/** Any upload. */
export type CfLiveBody = CfLiveFullBody | CfLiveDeltaBody | CfLiveTestBody;
/**
 * Reads the answer of `GET {base}/info`. Lenient, since sites are built by many tools:
 * missing lists fall back to what every site must support.
 *
 * @param json - The parsed answer.
 * @returns What the site supports, or `null` if the answer is not this protocol's.
 */
export declare function parseInfo(json: unknown): CfLiveInfo | null;
/**
 * The answer a site gives to `GET {base}/info`.
 *
 * @param supports - Whether the site takes delta uploads and gzip.
 * @param prompt - The prompt version the site was built from.
 */
export declare function infoAnswer(supports: {
    delta: boolean;
    gzip: boolean;
}, prompt?: number): Record<string, unknown>;
/** How the app will upload to a site, agreed from the site's `info`. */
export type CfLiveAgreement = {
    ok: true;
    /** The highest protocol version both sides speak. */
    version: number;
    mode: CfLiveMode;
    encoding: CfLiveEncoding;
    /** What the app wanted but the site does not take, e.g. `["delta"]`. */
    notSupported: ("delta" | "gzip")[];
    /** Whether the site was built from an older prompt than {@link CF_LIVE_PROMPT_VERSION}. */
    olderPrompt: boolean;
} | {
    ok: false;
    /** The site and the app share no protocol version. */
    reason: "no-common-version";
    /** The site's versions and the app's. */
    theirs: number[];
    ours: number[];
};
/**
 * Agrees on how to upload: the highest common protocol version, and the wanted mode and
 * encoding when the site takes them, else `full` and `identity`, which every site takes.
 * Never fails because of a mode or an encoding, so an old or simple site keeps working.
 *
 * @param info - The site's `info` (see {@link parseInfo}).
 * @param wanted - What the organiser chose.
 * @param ours - The versions the app speaks; {@link CF_LIVE_VERSIONS} unless testing.
 */
export declare function agree(info: CfLiveInfo, wanted: {
    mode: CfLiveMode;
    gzip: boolean;
}, ours?: readonly number[]): CfLiveAgreement;
/**
 * The delta from one full upload to the next: the classes whose content changed or are
 * new, and the ids of those that are gone. Classes are compared as JSON, so any change in
 * a class sends it whole.
 *
 * @param previous - The last full state the site accepted.
 * @param next - The new full state.
 * @param sequence - The new upload's number.
 * @returns The delta body, or `null` when nothing changed (not even the competition).
 */
export declare function deltaBetween(previous: CfLiveFullBody, next: CfLiveFullBody, sequence: number): CfLiveDeltaBody | null;
/** What a site holds per competition. */
export interface CfLiveStored {
    /** The latest full state, deltas applied. */
    data: CfLiveFullBody;
    /** The `sequence` of the last upload applied. */
    lastSequence: number;
}
/**
 * The site's answer to an upload, and what to store. Status codes as in the protocol:
 * 204 accepted, 400 not a body of this protocol, 409 a delta that cannot be applied
 * (answer `{"needFull":true}`).
 */
export type CfLiveOutcome = {
    status: 204;
    competitionId: string | null;
    store: CfLiveStored | null;
} | {
    status: 400;
    error: string;
} | {
    status: 409;
    body: {
        needFull: true;
    };
};
/**
 * For sites: checks an upload and works out what to store, after the key has been checked
 * (a wrong key is 401, before anything else). Pure: give it what is stored for the body's
 * competition, then store `store` (in one transaction with the read, for deltas) when it
 * is not null.
 *
 * Unknown fields are kept as they are, so a newer app's additions reach the page.
 *
 * @param body - The parsed JSON body.
 * @param storedFor - What the site holds for a competition id, or null.
 */
export declare function applyUpload(body: unknown, storedFor: (competitionId: string) => CfLiveStored | null): CfLiveOutcome;
export {};
