/**
 * The id of a course's page on ControlFreak Live: runners who send their run to the site's
 * keyless address (`RUN_LIVE_OPEN_PATH` in `orienteering-formats/run-live`) are grouped by the
 * course they ran, and two links of the same course must meet on the same page.
 *
 * The id is the first 16 hex characters (64 bits) of the SHA-256 of a canonical text of the
 * course, see {@link openCourseKey}. The text holds what makes a course the same race: the
 * kind of course and its rules, the start, the controls' codes and positions, the finish.
 * Not the name, so a renamed course stays on its page.
 *
 * Positions are taken on the course link's own grid of 1e-5 degrees (about 1 m), so a
 * control moved by more than a metre or given another code makes another course. On a
 * score course the order of the controls carries no meaning, so they are sorted first.
 *
 * SHA-256 rather than a short non-cryptographic hash: anyone can send to the keyless address,
 * and a course made to collide with another must not land on its page. It is computed here,
 * synchronously, rather than with Web Crypto: `crypto.subtle` is asynchronous and missing on
 * plain-http pages, and the id is wanted while building a link. Any language (the server,
 * Run, the watch app's documentation) can still compute the same id from
 * {@link openCourseKey} with its own SHA-256.
 *
 * Compatibility: the id names pages that people link to. The canonical text and the hash
 * never change; `test/run-frozen.test.mjs` pins an id.
 */
import { runCourseFromHash } from "./course.js";
/** Length of a course id, in hex characters. */
export const OPEN_COURSE_ID_LENGTH = 16;
const grid = (deg) => Math.round(deg * 1e5);
const pos = (p) => (p ? `${grid(p.lat)},${grid(p.lng)}` : "");
/**
 * The canonical text of a course that {@link openCourseId} hashes, ASCII:
 *
 *     oc1|<kind>|<start>|<controls>|<finish>
 *
 * - `kind`: `f` for a fixed order, `s<time limit>,<penalty per minute>` for a score course.
 * - `start`, `finish`: `<lat>,<lng>` as integers in 1e-5 degrees (`Math.round(deg * 1e5)`),
 *   or empty when the course has none.
 * - `controls`: `<code>,<lat>,<lng>` per control, with `,<points>` on a score course, joined
 *   by `;`. In course order, or on a score course sorted by code, then lat, lng, points.
 *
 * @param course - The course, as read from a course link.
 */
export function openCourseKey(course) {
    const score = course.score;
    const controls = course.controls.map((c) => {
        const row = [c.code, grid(c.lat), grid(c.lng)];
        if (score)
            row.push(c.points ?? 0);
        return row;
    });
    if (score) {
        controls.sort((a, b) => {
            for (let i = 0; i < a.length; i++)
                if (a[i] !== b[i])
                    return a[i] - b[i];
            return 0;
        });
    }
    const kind = score ? `s${score.timeLimitMinutes},${score.penaltyPerMinute}` : "f";
    return ["oc1", kind, pos(course.start), controls.map((r) => r.join(",")).join(";"), pos(course.finish)].join("|");
}
/**
 * The id of a course's page: the first {@link OPEN_COURSE_ID_LENGTH} hex characters of the
 * SHA-256 of {@link openCourseKey}.
 *
 * @param course - The course, or a course link: its data after `#`, with or without the `#`,
 *   or the whole link (everything up to the first `#` is ignored).
 * @returns The id, or null when the link holds no readable course.
 */
export function openCourseId(course) {
    let c;
    if (typeof course === "string") {
        const at = course.indexOf("#");
        try {
            c = runCourseFromHash(at >= 0 ? course.slice(at + 1) : course);
        }
        catch {
            return null;
        }
        if (!c)
            return null;
    }
    else {
        c = course;
    }
    return sha256Hex(openCourseKey(c)).slice(0, OPEN_COURSE_ID_LENGTH);
}
const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
/** SHA-256 (FIPS 180-4) of a string's UTF-8 bytes, as lowercase hex. */
function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const len = data.length;
    const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(data);
    padded[len] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
    view.setUint32(padded.length - 4, (len << 3) >>> 0);
    const h = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    const w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < padded.length; off += 64) {
        for (let i = 0; i < 16; i++)
            w[i] = view.getUint32(off + i * 4);
        for (let i = 16; i < 64; i++) {
            const a = w[i - 15];
            const b = w[i - 2];
            const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
            const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }
        const v = Array.from(h);
        for (let i = 0; i < 64; i++) {
            const [a, b, c, d, e, f, g, hh] = v;
            const t1 = hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
            const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
            v[7] = g;
            v[6] = f;
            v[5] = e;
            v[4] = (d + t1) | 0;
            v[3] = c;
            v[2] = b;
            v[1] = a;
            v[0] = (t1 + t2) | 0;
        }
        for (let i = 0; i < 8; i++)
            h[i] = h[i] + v[i];
    }
    return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
}
