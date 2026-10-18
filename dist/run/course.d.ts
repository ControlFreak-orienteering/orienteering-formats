/**
 * The course format in the QR links for virtual controls:
 * `https://run.controlfreak.se/#<payload>`.
 *
 * ControlFreak (course setting) writes the link and prints it as a QR code; the runner app
 * on run.controlfreak.se reads it. The course sits after `#`, so it is never sent to a server.
 *
 * The payload is binary, written with only the 43 characters `0-9A-Z$*+-./:`. They are all
 * in the QR code's alphanumeric mode (11 bits per two characters instead of 16) and safe in
 * a URL fragment without escaping. Two bytes become three characters, a last odd byte two,
 * like base45 (RFC 9285) without space and `%`. A QR code for the link is built from two
 * segments: the prefix in byte mode and the payload in alphanumeric mode
 * (see {@link runCourseQrSegments}).
 *
 * The first byte is the format version and is read before anything else, so a later
 * version can be refused without reading the rest. Every later version must read version 1.
 *
 * Byte layout of version 1:
 *
 *     version (1 byte)
 *     flags (1 byte): bit 0 = finish, bit 1 = start, bit 2 = score course
 *     name: length in bytes (varint), UTF-8
 *     [score course: time limit in minutes (varint), penalty per started minute (varint)]
 *     [start: lat delta, lng delta]
 *     number of controls (varint)
 *     per control: code (varint), [score course: points (varint)], lat delta, lng delta
 *     [finish: lat delta, lng delta]
 *
 * Coordinates are integers in 1e-5 degrees (about 1 m). Each position is a zigzag varint
 * delta from the previous one in that order (the first from 0, 0), so a control within a
 * few km of the previous one takes about 5 bytes.
 *
 * The code holds only the course. The punching rules are fixed in the runner app, so the
 * same code is always punched the same way.
 */
/** Origin of the runner app. */
export declare const RUN_ORIGIN = "https://run.controlfreak.se";
/** Path of the runner app on {@link RUN_ORIGIN}; the course follows after `#`. */
export declare const RUN_PATH = "/";
/** Everything in a course link before the payload: `https://run.controlfreak.se/#`. */
export declare const RUN_URL_PREFIX = "https://run.controlfreak.se/#";
/**
 * The 43 characters a payload is written with, in value order: digits, capital letters,
 * then `$*+-./:`. A subset of the QR alphanumeric mode, safe in a URL fragment.
 */
export declare const RUN_PAYLOAD_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*+-./:";
/** The format version this package writes and the highest it reads. */
export declare const RUN_FORMAT_VERSION = 1;
/** A position in WGS84 degrees. */
export type RunPoint = {
    lat: number;
    lng: number;
};
/** A control to punch: its code and position. */
export type RunControl = {
    /** Punch code, a non-negative integer. */
    code: number;
    /** Latitude in WGS84 degrees. */
    lat: number;
    /** Longitude in WGS84 degrees. */
    lng: number;
    /**
     * Points for the control on a score course; a non-negative integer. Only stored when the
     * course has `score`, and then always present after reading (missing is written as 0).
     */
    points?: number;
};
/** Rules for a score course (rogaining): controls in any order within a time limit. */
export type RunScore = {
    /** Time limit in whole minutes. */
    timeLimitMinutes: number;
    /** Points taken off for each started minute over the time limit. */
    penaltyPerMinute: number;
};
/** A course as carried in a QR link. */
export type RunCourse = {
    /** Format version; always 1. */
    v: 1;
    /** Course name, shown to the runner. */
    name: string;
    /** The start point (the triangle on the map), or null when the course has none. */
    start: RunPoint | null;
    /** Controls in course order; on a score course the order carries no meaning. */
    controls: RunControl[];
    /** The finish point, or null when the course has none. */
    finish: RunPoint | null;
    /** Score course rules, or null for a course with a fixed order. */
    score: RunScore | null;
};
/** The two parts of a QR code for a course link (see {@link runCourseQrSegments}). */
export type RunQrSegments = {
    /** {@link RUN_URL_PREFIX}, to be encoded as a byte segment. */
    prefix: string;
    /** The payload, to be encoded as an alphanumeric segment. */
    payload: string;
};
/**
 * Writes a course as a payload for the link (without the prefix).
 *
 * Coordinates are rounded to 1e-5 degrees; codes, points and the score rules to
 * non-negative integers.
 *
 * @param course - The course to write.
 * @returns The payload, only characters from {@link RUN_PAYLOAD_ALPHABET}.
 */
export declare function encodeRunCourse(course: RunCourse): string;
/**
 * Reads a payload written by {@link encodeRunCourse}.
 *
 * @param payload - The payload, without the prefix.
 * @returns The course. Controls have `points` only on a score course.
 * @throws {FormatError} `newer-version` when written by a newer version of the format
 *   (decided by the first byte alone), `unreadable` when cut short or garbage.
 */
export declare function decodeRunCourse(payload: string): RunCourse;
/**
 * The link to a course in the runner app.
 *
 * @param course - The course to link to.
 * @returns `https://run.controlfreak.se/#<payload>`.
 */
export declare function runCourseUrl(course: RunCourse): string;
/**
 * The two segments of a QR code for a course link: the prefix as a byte segment and the
 * payload as an alphanumeric segment. With qrcodegen:
 * `QrCode.encodeSegments([QrSegment.makeBytes(utf8(prefix)), QrSegment.makeAlphanumeric(payload)], Ecc.MEDIUM)`.
 * The QR library itself stays in the apps.
 *
 * @param course - The course to encode.
 * @returns The prefix and payload; `prefix + payload` is {@link runCourseUrl}.
 */
export declare function runCourseQrSegments(course: RunCourse): RunQrSegments;
/**
 * The course in a `location.hash`: the whole fragment is the payload.
 *
 * @param hash - `location.hash`, with or without the leading `#`.
 * @returns The course, or null when the fragment is empty.
 * @throws {FormatError} As {@link decodeRunCourse} when there is a fragment that is not
 *   a readable course.
 */
export declare function runCourseFromHash(hash: string): RunCourse | null;
