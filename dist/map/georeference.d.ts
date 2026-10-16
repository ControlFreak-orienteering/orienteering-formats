/**
 * From the map's own coordinates to latitude and longitude, and back.
 *
 * A georeferenced map carries three things: where the map's origin lies in
 * a grid (east/north in metres), which grid it is, and how much the map is
 * rotated against it. With them every point on the map can be converted to
 * WGS84: what `<Position>` in an IOF file wants, and what timing and GPS
 * systems read.
 *
 * Only transverse Mercator grids are converted, and only those on WGS84 or
 * ETRS89. That covers UTM, SWEREF 99 and the Finnish ETRS-GK zones, which
 * in practice is all Nordic orienteering. Older national systems (RT 90,
 * ED 50, NGO 1948, KKJ, OSGB) also need a datum transformation, and no
 * coordinates are better than coordinates a hundred metres off: they give
 * `null`.
 */
/** An ellipsoid: semi-major axis `a` in metres and flattening `f`. */
export type Ellipsoid = {
    a: number;
    f: number;
};
/** A transverse Mercator projection (UTM, SWEREF 99 TM, ETRS-GKn). */
export type TransverseMercator = {
    /** Central meridian, degrees east. */
    centralMeridian: number;
    /** Latitude northings are counted from, in degrees. Zero except in a few grids. */
    latitudeOfOrigin: number;
    /** Scale factor on the central meridian. */
    scaleFactor: number;
    /** False easting in metres. */
    falseEasting: number;
    /** False northing in metres. */
    falseNorthing: number;
    /** The ellipsoid. */
    ellipsoid: Ellipsoid;
};
/** A position on earth in WGS84, in degrees. */
export type LatLng = {
    lat: number;
    lng: number;
};
/**
 * Where a map lies on earth: its origin in a projected grid, and its rotation against
 * the grid. The same shape as `ExchangeGeoreference` in a `.cfpack`.
 */
export type MapGeoreference = {
    /** Grid easting of the map's own origin, in metres. */
    easting: number;
    /** Grid northing of the map's own origin, in metres. */
    northing: number;
    /**
     * The angle from grid north to map north, in degrees clockwise.
     *
     * An orienteering map is drawn with magnetic north up, and grid north
     * points another way; the difference is what OCAD calls "real world
     * angle" and Mapper calls `grivation`. Almost always under two degrees,
     * but over a map's width even that becomes tens of metres.
     */
    grivationDeg: number;
    /** The grid. */
    projection: TransverseMercator;
};
/**
 * A UTM zone's projection. Zone 1 starts at 180° west, and each zone is six degrees wide.
 *
 * @param zone - The zone, 1–60.
 * @param south - Whether it is the southern hemisphere.
 * @returns The projection, or `null` for a zone that does not exist.
 */
export declare function utmProjection(zone: number, south: boolean): TransverseMercator | null;
/**
 * The projection for an EPSG code, or `null` for codes this module cannot
 * compute with; see the module comment for which they are and why.
 *
 * @param code - The EPSG code, e.g. 3006 for SWEREF 99 TM.
 */
export declare function projectionForEpsg(code: number): TransverseMercator | null;
/**
 * The projection for OCAD's grid number (field `i` in parameter string
 * 1039). The number carries grid and zone in one: the grid is the
 * thousands and the zone the rest, and a negative number means the
 * southern hemisphere. The numbers follow OCAD's own table, as
 * OpenOrienteering Mapper reads them.
 *
 * @param gridAndZone - The number from the file.
 * @returns The projection, or `null` for a grid this module does not convert.
 */
export declare function projectionForOcadGrid(gridAndZone: number): TransverseMercator | null;
/**
 * The projection from a PROJ.4 string, as OpenOrienteering Mapper writes
 * it. Three forms occur: a plain EPSG reference, a UTM zone, and a
 * spelled-out transverse Mercator; the last needs no table at all.
 *
 * @param spec - The PROJ.4 string.
 * @returns The projection, or `null` for one this module does not convert.
 */
export declare function projectionFromProj4(spec: string): TransverseMercator | null;
/**
 * The Gauss–Krüger series, forwards: latitude and longitude to the grid's
 * east and north. The series is cut after the fourth order, which stays
 * within a millimetre or so in a zone-wide belt: more than enough for a
 * control.
 */
declare function project(p: TransverseMercator, latDeg: number, lngDeg: number): [number, number];
/**
 * The same series backwards: the grid's east and north to latitude and longitude.
 *
 * @param p - The grid.
 * @param easting - Grid easting in metres.
 * @param northing - Grid northing in metres.
 * @returns The position in WGS84.
 */
export declare function unproject(p: TransverseMercator, easting: number, northing: number): LatLng;
/**
 * Where on earth a point on the map lies.
 *
 * No scale factor between ground and grid distances is applied, on
 * purpose, although Mapper writes one (`auxiliary_scale_factor`). That was
 * measured, not assumed: against 22 controls whose `<Position>` Purple Pen
 * computed from the same map's georeference, the error is 0.02 m without
 * the factor and 0.34 m with it, whichever way it is applied. Purple Pen
 * does not apply it, so neither does this, or the same course would point
 * to two places depending on which program wrote the file.
 *
 * @param georef - Where the map lies.
 * @param east - Metres east of the map's own origin, in the map's own
 *   directions (map north up, not grid north). The rotation is applied here.
 * @param north - Metres north of the map's own origin, likewise.
 * @returns The position in WGS84.
 */
export declare function mapToWgs84(georef: MapGeoreference, east: number, north: number): LatLng;
/**
 * `mapToWgs84` backwards: where on the map a point on earth lies, e.g. to
 * draw a phone's GPS position.
 *
 * @param georef - Where the map lies.
 * @param lat - Latitude in WGS84.
 * @param lng - Longitude in WGS84.
 * @returns Metres from the map's own origin, in the map's own directions.
 */
export declare function wgs84ToMap(georef: MapGeoreference, lat: number, lng: number): {
    east: number;
    north: number;
};
/** For tests only: the forward series, so the conversion can be tested both ways. */
export declare const projectForTest: typeof project;
export {};
