import { BinaryReader } from "./binary-reader.js";
/**
 * A parsed OCAD "parameter string": a tab-separated record where the part
 * before the first tab is the free-text "subject" and each following part
 * starts with a one-letter field code, e.g. `Cyan\tc0\tm20\ty100\tk0\tn1`.
 */
export interface ParameterString {
    recordType: number;
    subject: string;
    fields: Map<string, string>;
    /**
     * The parts after the subject, in order and with their letters, e.g. `["sS1", "c31",
     * "fM1"]`. `fields` keeps only the last part of each letter; a course needs them all.
     */
    parts: string[];
    /**
     * The object the string belongs to, numbered from 1 in the object index (0 for none).
     * A course-setting control string names the object that marks the control.
     */
    objectIndex: number;
}
/**
 * Walks the (possibly chained) parameter-string index blocks starting at
 * `firstBlockPos` and returns every parameter string in the file, grouped
 * by record type (9 = color, 1039 = scale/georeferencing, 1050+ = course
 * setting data, etc. — see the OCAD file format wiki's "String" table).
 */
export declare function readParameterStrings(reader: BinaryReader, firstBlockPos: number): Map<number, ParameterString[]>;
/**
 * Splits one parameter string into its subject and lettered parts.
 *
 * @param recordType - The string's record type.
 * @param text - The string as stored, tab-separated.
 * @param objectIndex - The object it belongs to (0 for none).
 */
export declare function parseParameterString(recordType: number, text: string, objectIndex?: number): ParameterString;
