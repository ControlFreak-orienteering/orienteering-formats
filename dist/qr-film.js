/**
 * Moving data from one device to another as a "QR film": a series of QR codes
 * shown one after the other on the sending screen and filmed by the receiving device's
 * camera. No network, no file and no connection between the devices is needed.
 *
 * The payload (JSON text) is gzip-compressed, written as base64url text, and cut into
 * frames. Each frame is one QR code:
 *
 * ```
 * CFQ1|<transfer id>|<index>|<count>|<data>
 * ```
 *
 * - `CFQ1`: identifies the format and its version.
 * - `transfer id`: a few random characters, the same in all frames of one transfer, so
 *   frames from an earlier transfer are not mixed in.
 * - `index` (0-based) and `count`: where the frame belongs. The sender shows the frames
 *   in a loop, so the receiver collects them in any order until it has all.
 * - `data`: the frame's slice of the base64url text.
 *
 * Pure apart from compression, which uses the browser's (and Node's) `CompressionStream`.
 *
 * Moved here from CompetitionFreak (2026-10-17), since CompetitionFreak and the start
 * clock (startklocka) both use it: CompetitionFreak sends competitions and start lists,
 * the start clock reads start lists. The frame format is unchanged, so films made
 * before still read.
 */
import { FormatError } from "./errors.js";
/** Marks a transfer frame; also the format version. */
export const FRAME_PREFIX = "CFQ1|";
/**
 * Characters of data per frame. Small enough for a QR code a tablet camera reads quickly
 * off a screen; a few kilobytes then take a few seconds.
 */
export const FRAME_DATA_SIZE = 400;
/** Bytes to base64url text (no padding). */
function toBase64Url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** Base64url text back to bytes. */
function fromBase64Url(text) {
    const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++)
        bytes[i] = binary.charCodeAt(i);
    return bytes;
}
async function gzip(text) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
}
/** A short random id for one transfer. */
function transferId() {
    return Math.random().toString(36).slice(2, 8);
}
/**
 * Cuts a payload into the frames to show.
 *
 * @param payload - The text to move (e.g. JSON).
 * @param dataSize - Characters of data per frame.
 * @returns The frames, each the text of one QR code.
 */
export async function encodeFrames(payload, dataSize = FRAME_DATA_SIZE) {
    const data = toBase64Url(await gzip(payload));
    const count = Math.max(1, Math.ceil(data.length / dataSize));
    const id = transferId();
    return Array.from({ length: count }, (_, index) => `${FRAME_PREFIX}${id}|${index}|${count}|${data.slice(index * dataSize, (index + 1) * dataSize)}`);
}
/**
 * Collects frames read by the camera until the transfer is complete. Frames of another
 * transfer than the first one seen are ignored, so an old film on the screen cannot mix
 * in; `reset` starts over.
 */
export class FrameCollector {
    id = null;
    parts = [];
    /**
     * Takes a QR code's text.
     *
     * @returns `true` when the text was a new frame of this transfer.
     */
    add(text) {
        if (!text.startsWith(FRAME_PREFIX))
            return false;
        const [id, indexText, countText, ...rest] = text.slice(FRAME_PREFIX.length).split("|");
        const index = Number(indexText);
        const count = Number(countText);
        const data = rest.join("|");
        if (!id || !Number.isInteger(index) || !Number.isInteger(count) || count < 1)
            return false;
        if (index < 0 || index >= count || count > 10_000)
            return false;
        if (this.id === null) {
            this.id = id;
            this.parts = Array.from({ length: count }, () => undefined);
        }
        if (id !== this.id || count !== this.parts.length || this.parts[index] !== undefined) {
            return false;
        }
        this.parts[index] = data;
        return true;
    }
    /** How many frames have come, of how many. */
    progress() {
        return {
            received: this.parts.filter((p) => p !== undefined).length,
            count: this.id === null ? null : this.parts.length,
        };
    }
    /** Whether every frame has come. */
    complete() {
        if (this.id === null)
            return false;
        // A loop, not `every`: `every` skips the empty slots of a new array.
        for (let i = 0; i < this.parts.length; i++)
            if (this.parts[i] === undefined)
                return false;
        return true;
    }
    /**
     * The payload, once complete.
     *
     * @throws {@link FormatError} `unreadable` if frames are missing or the data is damaged.
     */
    async payload() {
        if (!this.complete())
            throw new FormatError("unreadable");
        try {
            return await gunzip(fromBase64Url(this.parts.join("")));
        }
        catch {
            throw new FormatError("unreadable");
        }
    }
    /** Forgets everything collected, e.g. to read another transfer. */
    reset() {
        this.id = null;
        this.parts = [];
    }
}
