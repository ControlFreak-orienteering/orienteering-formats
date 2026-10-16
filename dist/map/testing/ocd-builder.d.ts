/**
 * Builds tiny but structurally complete .ocd files in memory, byte for
 * byte, for the parser tests. Layouts follow OpenOrienteering Mapper's
 * `ocd_types_v9.h`/`v11.h`/`v12.h` (the de-facto reference for the
 * format): a 60-byte header, then one index block each for parameter
 * strings, symbols and objects, followed by the records themselves.
 *
 * Only what the parser reads is modelled; everything else is zero.
 */
export type OcdVersion = 10 | 11 | 12 | 2018;
/** [x, y, xFlags?, yFlags?] in 1/100 mm; flags are OCAD's low-byte bits. */
export type Coord = [x: number, y: number, xFlags?: number, yFlags?: number];
/** A drawing primitive of a point symbol to write. */
export interface ElementSpec {
    type: 1 | 2 | 3 | 4;
    color: number;
    lineWidth?: number;
    diameter?: number;
    points: Coord[];
}
interface SymbolBase {
    symNum: number;
    description?: string;
    /** Symbol status: 0 normal, 2 hidden. */
    status?: number;
}
/** A map object to write. */
export interface ObjectSpec {
    sym: number;
    /** Object type: 1 point, 2 line, 3 area, 4 unformatted text, 5 formatted text. */
    otp: 1 | 2 | 3 | 4 | 5 | 6;
    coords: Coord[];
    text?: string;
    angleTenths?: number;
    /** Index status: 1 normal, 2 hidden, 3 deleted. */
    status?: 1 | 2 | 3;
    /** Override the coordinate count written to the header (for corrupt-file tests). */
    nItemOverride?: number;
}
/**
 * Builds an .ocd file in memory, for tests: add colours, symbols and
 * objects, then call `build()`.
 *
 * @example
 * new OcdFileBuilder(2018).addColor(0, "Black", [0, 0, 0, 100]).addScale(10000).build();
 */
export declare class OcdFileBuilder {
    readonly version: OcdVersion;
    private strings;
    private symbols;
    private objects;
    /** Test hooks: make an index block's "next block" pointer point at itself. */
    selfLinkedIndex: {
        strings?: boolean;
        symbols?: boolean;
        objects?: boolean;
    };
    constructor(version: OcdVersion);
    addString(recordType: number, text: string): this;
    /** Convenience: a type-9 color record. Colors are listed front-most first. */
    addColor(number: number, name: string, cmyk: [number, number, number, number]): this;
    addScale(mapScale: number): this;
    addPointSymbol(spec: SymbolBase & {
        elements: ElementSpec[];
    }): this;
    addLineSymbol(spec: SymbolBase & {
        lineColor: number;
        lineWidth: number;
        mainLength?: number;
        mainGap?: number;
    }): this;
    addAreaSymbol(spec: SymbolBase & {
        fillColor: number;
        fillOn?: boolean;
    }): this;
    addTextSymbol(spec: SymbolBase & {
        fontName: string;
        fontColor: number;
        fontSizeTenths: number;
    }): this;
    addObject(spec: ObjectSpec): this;
    private symbolHeader;
    private objectRecord;
    build(): ArrayBuffer;
}
/** Every version the builder writes, for tests that run on each. */
export declare const ALL_VERSIONS: OcdVersion[];
export {};
