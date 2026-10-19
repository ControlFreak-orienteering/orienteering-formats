/**
 * Shared data model produced by the OCAD parser.
 *
 * Coordinates throughout this module are in OCAD's native map units:
 * 1/100 mm at map scale, as signed integers, in an ordinary (not screen)
 * Y-up coordinate system. Renderers/consumers flip Y and scale as needed.
 */
export interface OcadPoint {
    x: number;
    y: number;
    /** True if this vertex is the first control point of a Bezier curve segment. */
    bezierFirst: boolean;
    /** True if this vertex is the second control point of a Bezier curve segment. */
    bezierSecond: boolean;
    /** True if this vertex starts a new hole/sub-path (area objects) or is a corner (lines). */
    corner: boolean;
    /** True if this vertex is the first point of a hole in an area object. */
    holeStart: boolean;
}
/** A colour in the map's colour table. */
export interface OcadColor {
    /** OCAD color number, used to cross-reference from symbols. */
    number: number;
    name: string;
    cmyk: [cyan: number, magenta: number, yellow: number, black: number];
    /** CSS-ready "rgb(r, g, b)" string. */
    rgb: string;
    /** Draw order: colors are defined "bottom paint layer first". */
    order: number;
}
/** The kinds of symbol; `unsupported` for symbol types that are not drawn. */
export type SymbolKind = "point" | "line" | "area" | "text" | "unsupported";
/** What every symbol has. */
export interface SymbolBase {
    kind: SymbolKind;
    /** Raw OCAD symbol number, e.g. 104000 for "104.0". */
    symNum: number;
    /** Human "104.0"-style symbol number. */
    number: string;
    description: string;
    hidden: boolean;
}
/** One drawing primitive of a point symbol (or of an area's structure tile). */
export interface PointSymbolElement {
    type: "line" | "area" | "circle" | "dot";
    color: number;
    lineWidth: number;
    diameter: number;
    points: OcadPoint[];
}
/** A point symbol, e.g. a boulder: drawn at the object's point. */
export interface PointSymbol extends SymbolBase {
    kind: "point";
    elements: PointSymbolElement[];
}
/** A line symbol, e.g. a path or a road. */
export interface LineSymbol extends SymbolBase {
    kind: "line";
    lineColor: number;
    lineWidth: number;
    dashed: {
        mainLength: number;
        mainGap: number;
        secondaryGap: number;
        endLength: number;
        endGap: number;
    };
    doubleLine?: {
        mode: number;
        fillColor: number;
        fillOn: boolean;
        leftColor: number;
        rightColor: number;
        width: number;
        leftWidth: number;
        rightWidth: number;
    };
    framing?: {
        color: number;
        width: number;
    };
    /** Symbols drawn along the line, see `LineDecorations`. Absent when there are none. */
    decorations?: LineDecorations;
}
/**
 * The small symbols a line symbol draws along itself: a cliff's tags, a fence's
 * ticks, a power line's pylons, a contour's slope lines. Each is drawn like a
 * point symbol, turned to follow the line: its x axis points along the line and
 * its y axis to the left of it, so negative y lies to the right.
 */
export interface LineDecorations {
    /** Repeated along the line, `mainLength` apart and `endLength` from its ends (see `LineSymbol.dashed`). */
    primary: PointSymbolElement[];
    /** How many primary symbols stand together at each place, and how far apart. */
    primaryCount: number;
    primaryDistance: number;
    /** At each corner point (`OcadPoint.corner`), e.g. pylons or slope lines. */
    corner: PointSymbolElement[];
    /** At the line's first point. */
    start: PointSymbolElement[];
    /** At the line's last point. */
    end: PointSymbolElement[];
}
/** An area symbol, e.g. a lake or a forest area. */
export interface AreaSymbol extends SymbolBase {
    kind: "area";
    fillColor: number;
    fillOn: boolean;
    /** 0 = no hatch, 1 = single-direction hatch lines, 2 = cross-hatch (both angles). */
    hatchMode: number;
    hatchColor: number;
    hatchLineWidth: number;
    /** Spacing between hatch lines, center to center, in 1/100 mm. */
    hatchDistance: number;
    hatchAngle1Deg: number;
    hatchAngle2Deg: number;
    borderSymbolNumber: number;
    /** The symbol's own point-style graphics — used directly for point symbols, and as the repeated icon(s) for a "structure" area-fill pattern below. */
    elements: PointSymbolElement[];
    /** Repeating-icon area fill ("structure" in OCAD's terminology, e.g. dot/tree/rock patterns), using `elements` as the tile's icon(s). Absent when the symbol has no structure fill. */
    structure?: {
        /** 1 = regular grid, 2 = staggered/brick grid (rows offset by half a cell). */
        mode: number;
        cellWidth: number;
        cellHeight: number;
        angleDeg: number;
    };
}
/** A text symbol, e.g. a place name. */
export interface TextSymbol extends SymbolBase {
    kind: "text";
    fontName: string;
    fontColor: number;
    fontSize: number;
    bold: boolean;
    italic: boolean;
    alignmentHorizontal: "left" | "center" | "right";
}
/** A symbol of a type that is not drawn. */
export interface UnsupportedSymbol extends SymbolBase {
    kind: "unsupported";
}
/** Any symbol. */
export type OcadSymbol = PointSymbol | LineSymbol | AreaSymbol | TextSymbol | UnsupportedSymbol;
/** The kinds of map object. */
export type ObjectKind = "point" | "line" | "area" | "text";
/** One object on the map: a symbol at a place. */
export interface MapObject {
    symNum: number;
    kind: ObjectKind;
    angle: number;
    /** Object-level color override (only meaningful for a few symbol types); -1 = use symbol's own color. */
    color: number;
    coordinates: OcadPoint[];
    text: string;
}
/** The map's scale and georeference, as the OCAD file states them. */
export interface GeoReference {
    /** Real-world easting of the OCAD map-coordinate origin. */
    easting: number;
    /** Real-world northing of the OCAD map-coordinate origin. */
    northing: number;
    /** Ground scale factor, e.g. 1 for a 1:1 grid reference or a projection-specific factor. */
    scale: number;
    /** Map scale denominator, e.g. 15000 for a 1:15,000 map. */
    mapScale: number;
    /** Rotation of the map's grid relative to true/grid north, in radians. */
    grivationRad: number;
    /**
     * OCAD's own grid-and-zone number (field `i`): the grid in the thousands
     * and the zone in the rest, negative for the southern hemisphere. Says
     * which coordinate system `easting`/`northing` are in — see
     * `projectionForOcadGrid`.
     */
    gridAndZone: number;
    /** Whether the file says its coordinates are real-world ones (field `r`). */
    realWorldCoords: boolean;
}
/** A whole OCAD map, the same for every file version. */
export interface ParsedOcadMap {
    version: number;
    colors: OcadColor[];
    colorsByNumber: Map<number, OcadColor>;
    symbols: OcadSymbol[];
    symbolsByNumber: Map<number, OcadSymbol>;
    objects: MapObject[];
    georef: GeoReference | null;
    bounds: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    };
    warnings: string[];
}
