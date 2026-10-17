/**
 * A "clock code": a QR code that shows the sending computer's clock, so that a device with
 * a camera (e.g. the start clock, startklocka) can set itself to the same time as
 * CompetitionFreak without network.
 *
 * The sender redraws the code several times a second, each time with its current time:
 *
 * ```
 * CFT1|<milliseconds since 1970-01-01 UTC>
 * ```
 *
 * - `CFT1`: identifies the format and its version.
 * - The time is the sender's `Date.now()` when the code was drawn. Milliseconds since 1970
 *   are the same in every time zone, so the time zone of either device does not matter.
 *
 * The receiver notes its own time when the camera picture was taken. The code always
 * arrives a little late: the screen has to show it, the camera has to take it, and the
 * code may already have been on screen for a while. So the receiver collects codes for a
 * few seconds and keeps the one that arrived soonest after it was drawn (`ClockSampler`).
 * Its delay is the smallest, so its difference is the closest to the true one.
 *
 * Pure: the apps own the camera, the drawing and the timing.
 */
/** Marks a clock code; also the format version. */
export const CLOCK_CODE_PREFIX = "CFT1|";
/**
 * The text of a clock code.
 *
 * @param now - The sender's time in milliseconds since 1970 (normally `Date.now()`).
 * @returns The text to show as a QR code.
 */
export function writeClockCode(now) {
    return `${CLOCK_CODE_PREFIX}${Math.round(now)}`;
}
/**
 * The sender's time in a clock code.
 *
 * @param text - Text from a QR code.
 * @returns Milliseconds since 1970, or `null` when the text is not a clock code (e.g. a
 *   frame of a QR film or another QR code), so the receiver can ignore it.
 */
export function readClockCode(text) {
    if (!text.startsWith(CLOCK_CODE_PREFIX))
        return null;
    const digits = text.slice(CLOCK_CODE_PREFIX.length);
    if (!/^\d{1,15}$/.test(digits))
        return null;
    return Number(digits);
}
/**
 * Collects clock codes from the camera and works out the difference between the clocks.
 *
 * Each code gives "sender's time minus receiver's time minus delay", and the delay is
 * never negative. The largest of these differences therefore has the smallest delay and
 * is the best estimate. Its remaining error is the shortest delay seen, typically a few
 * hundredths of a second with a screen and a phone camera.
 */
export class ClockSampler {
    best = null;
    seen = new Set();
    /**
     * Adds a QR code read by the camera.
     *
     * @param text - The QR code's text; other codes are ignored.
     * @param receivedAt - The receiver's time (milliseconds since 1970) when the camera
     *   picture was taken, not when it was decoded, so decoding time is not counted.
     * @returns `true` when the text was a clock code.
     */
    add(text, receivedAt) {
        const sentAt = readClockCode(text);
        if (sentAt === null)
            return false;
        this.seen.add(sentAt);
        const difference = sentAt - receivedAt;
        if (this.best === null || difference > this.best)
            this.best = difference;
        return true;
    }
    /** How many different clock codes have been read. */
    get samples() {
        return this.seen.size;
    }
    /**
     * The measured difference.
     *
     * @returns The difference, or `null` before any clock code has been read.
     */
    offset() {
        if (this.best === null)
            return null;
        return { offsetMs: Math.round(this.best), samples: this.seen.size };
    }
}
