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
/** Marks a transfer frame; also the format version. */
export declare const FRAME_PREFIX = "CFQ1|";
/**
 * Characters of data per frame. Small enough for a QR code a tablet camera reads quickly
 * off a screen; a few kilobytes then take a few seconds.
 */
export declare const FRAME_DATA_SIZE = 400;
/**
 * Cuts a payload into the frames to show.
 *
 * @param payload - The text to move (e.g. JSON).
 * @param dataSize - Characters of data per frame.
 * @returns The frames, each the text of one QR code.
 */
export declare function encodeFrames(payload: string, dataSize?: number): Promise<string[]>;
/** How far the receiver has come. */
export interface FrameProgress {
    /** Frames received so far (different ones). */
    received: number;
    /** Frames in the transfer, or `null` before the first frame. */
    count: number | null;
}
/**
 * Collects frames read by the camera until the transfer is complete. Frames of another
 * transfer than the first one seen are ignored, so an old film on the screen cannot mix
 * in; `reset` starts over.
 */
export declare class FrameCollector {
    private id;
    private parts;
    /**
     * Takes a QR code's text.
     *
     * @returns `true` when the text was a new frame of this transfer.
     */
    add(text: string): boolean;
    /** How many frames have come, of how many. */
    progress(): FrameProgress;
    /** Whether every frame has come. */
    complete(): boolean;
    /**
     * The payload, once complete.
     *
     * @throws {@link FormatError} `unreadable` if frames are missing or the data is damaged.
     */
    payload(): Promise<string>;
    /** Forgets everything collected, e.g. to read another transfer. */
    reset(): void;
}
