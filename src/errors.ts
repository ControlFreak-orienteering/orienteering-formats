/**
 * Errors from reading a file, as a code rather than a sentence.
 *
 * The package does not know which language the app shows, so each app turns the code
 * into its own text.
 */

/**
 * Why a file could not be read.
 *
 * - `wrong-format`: the file is not of the kind the reader reads at all.
 * - `newer-version`: the file was written by a newer version of the format than this
 *   package reads.
 * - `unreadable`: the file claims to be one, but is damaged or cut short.
 * - `empty`: the file is of the right kind but holds nothing to read, e.g. a course
 *   file without courses.
 */
export type FormatErrorCode = "wrong-format" | "newer-version" | "unreadable" | "empty";

/** Thrown by the readers in this package. Check `code` to tell the cases apart. */
export class FormatError extends Error {
  /** Why the file could not be read. */
  readonly code: FormatErrorCode;

  /** @param code - Why the file could not be read. */
  constructor(code: FormatErrorCode) {
    super(code);
    this.name = "FormatError";
    this.code = code;
  }
}
