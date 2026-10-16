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
}
/**
 * Walks the (possibly chained) parameter-string index blocks starting at
 * `firstBlockPos` and returns every parameter string in the file, grouped
 * by record type (9 = color, 1039 = scale/georeferencing, 1050+ = course
 * setting data, etc. — see the OCAD file format wiki's "String" table).
 */
export declare function readParameterStrings(reader: BinaryReader, firstBlockPos: number): Map<number, ParameterString[]>;
