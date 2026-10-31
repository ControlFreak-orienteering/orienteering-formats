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
export type Ellipsoid = { a: number; f: number };

/** GRS 80, used by ETRS89 and SWEREF 99. */
const GRS80: Ellipsoid = { a: 6378137, f: 1 / 298.257222101 };
/** WGS 84. Differs from GRS 80 by less than a millimetre in the semi-axes. */
const WGS84: Ellipsoid = { a: 6378137, f: 1 / 298.257223563 };

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
export type LatLng = { lat: number; lng: number };

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

const RAD = Math.PI / 180;

function tm(
  centralMeridian: number,
  scaleFactor: number,
  falseEasting: number,
  options: {
    falseNorthing?: number;
    latitudeOfOrigin?: number;
    ellipsoid?: Ellipsoid;
  } = {},
): TransverseMercator {
  return {
    centralMeridian,
    latitudeOfOrigin: options.latitudeOfOrigin ?? 0,
    scaleFactor,
    falseEasting,
    falseNorthing: options.falseNorthing ?? 0,
    ellipsoid: options.ellipsoid ?? GRS80,
  };
}

/**
 * A UTM zone's projection. Zone 1 starts at 180° west, and each zone is six degrees wide.
 *
 * @param zone - The zone, 1–60.
 * @param south - Whether it is the southern hemisphere.
 * @returns The projection, or `null` for a zone that does not exist.
 */
export function utmProjection(
  zone: number,
  south: boolean,
): TransverseMercator | null {
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) return null;
  return tm(6 * zone - 183, 0.9996, 500000, {
    falseNorthing: south ? 10_000_000 : 0,
    ellipsoid: WGS84,
  });
}

/** SWEREF 99's twelve local zones, in EPSG order from 3007. */
const SWEREF99_LOCAL_MERIDIANS = [12, 13.5, 15, 16.5, 18, 14.25, 15.75, 17.25, 18.75, 20.25, 21.75, 23.25]; // prettier-ignore

/**
 * The projection for an EPSG code, or `null` for codes this module cannot
 * compute with; see the module comment for which they are and why.
 *
 * @param code - The EPSG code, e.g. 3006 for SWEREF 99 TM.
 */
export function projectionForEpsg(code: number): TransverseMercator | null {
  // SWEREF 99 TM, the grid Swedish maps are almost always in.
  if (code === 3006) return tm(15, 0.9996, 500000);
  // SWEREF 99 12 00 … 23 15. Lokala zoner: ingen skalfaktor, eget origo.
  if (code >= 3007 && code <= 3018) {
    return tm(SWEREF99_LOCAL_MERIDIANS[code - 3007]!, 1, 150000);
  }
  // ETRS-TM35FIN: UTM zone 35 over all of Finland.
  if (code === 3067) return tm(27, 0.9996, 500000);
  // ETRS-GK19FIN … ETRS-GK31FIN.
  if (code >= 3126 && code <= 3138) return tm(19 + (code - 3126), 1, 500000);
  // ETRS89 / UTM-zon 28N–38N.
  if (code >= 25828 && code <= 25838) return utmProjection(code - 25800, false);
  // WGS 84 / UTM, northern and southern hemisphere.
  if (code >= 32601 && code <= 32660) return utmProjection(code - 32600, false);
  if (code >= 32701 && code <= 32760) return utmProjection(code - 32700, true);
  return null;
}

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
export function projectionForOcadGrid(
  gridAndZone: number,
): TransverseMercator | null {
  if (!Number.isFinite(gridAndZone) || gridAndZone === 0) return null;
  const south = gridAndZone < 0;
  const value = Math.abs(Math.trunc(gridAndZone));
  const grid = Math.trunc(value / 1000);
  const zone = value % 1000;

  if (grid === 2) return utmProjection(zone, south);
  // Sweden: zone 2 is SWEREF 99 TM, zones 3–14 the local zones.
  if (grid === 13 && zone >= 2 && zone <= 14)
    return projectionForEpsg(3004 + zone);
  // Finland: zone 5 is TM35FIN, zones 19–31 the ETRS-GK zones. The older
  // KKJ zones are on another datum and are left alone.
  if (grid === 6 && zone === 5) return projectionForEpsg(3067);
  if (grid === 6 && zone >= 19 && zone <= 31)
    return projectionForEpsg(3107 + zone);
  return null;
}

/**
 * Are the string's coordinates already on WGS84?
 *
 * A missing datum means WGS84 in PROJ, so silence is accepted. If anything
 * other than WGS84 or GRS 80 is named, or there is a `+towgs84` with
 * anything but zeros, a datum transformation is needed, and then nothing
 * is converted at all.
 */
function datumIsWgs84Like(spec: string): boolean {
  const named = /\+(?:datum|ellps)\s*=\s*(\S+)/i.exec(spec);
  if (named && !/^(WGS84|GRS80|ETRS89)$/i.test(named[1]!)) return false;
  const shift = /\+towgs84\s*=\s*(\S+)/i.exec(spec);
  return !shift || shift[1]!.split(",").every((v) => Number(v) === 0);
}

/**
 * The projection from a PROJ.4 string, as OpenOrienteering Mapper writes
 * it. Three forms occur: a plain EPSG reference, a UTM zone, and a
 * spelled-out transverse Mercator; the last needs no table at all.
 *
 * @param spec - The PROJ.4 string.
 * @returns The projection, or `null` for one this module does not convert.
 */
export function projectionFromProj4(spec: string): TransverseMercator | null {
  const epsg = /\+init\s*=\s*epsg:(\d+)/i.exec(spec);
  if (epsg) return projectionForEpsg(Number(epsg[1]));

  const field = (name: string): number | null => {
    const m = new RegExp(`\\+${name}\\s*=\\s*(-?[\\d.]+)`).exec(spec);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  };

  if (!datumIsWgs84Like(spec)) return null;

  if (/\+proj\s*=\s*utm\b/i.test(spec)) {
    const zone = field("zone");
    return zone === null ? null : utmProjection(zone, /\+south\b/i.test(spec));
  }

  if (/\+proj\s*=\s*tmerc\b/i.test(spec)) {
    const lon0 = field("lon_0");
    if (lon0 === null) return null;
    return tm(lon0, field("k_0") ?? field("k") ?? 1, field("x_0") ?? 0, {
      falseNorthing: field("y_0") ?? 0,
      latitudeOfOrigin: field("lat_0") ?? 0,
    });
  }
  return null;
}

/**
 * The Gauss–Krüger series, forwards: latitude and longitude to the grid's
 * east and north. The series is cut after the fourth order, which stays
 * within a millimetre or so in a zone-wide belt: more than enough for a
 * control.
 */
function project(
  p: TransverseMercator,
  latDeg: number,
  lngDeg: number,
): [number, number] {
  const { a, f } = p.ellipsoid;
  const e2 = f * (2 - f);
  const n = f / (2 - f);
  const aRoof = (a / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64);

  const A = e2;
  const B = (5 * e2 ** 2 - e2 ** 3) / 6;
  const C = (104 * e2 ** 3 - 45 * e2 ** 4) / 120;
  const D = (1237 * e2 ** 4) / 1260;

  const b1 = n / 2 - (2 * n ** 2) / 3 + (5 * n ** 3) / 16 + (41 * n ** 4) / 180;
  const b2 = (13 * n ** 2) / 48 - (3 * n ** 3) / 5 + (557 * n ** 4) / 1440;
  const b3 = (61 * n ** 3) / 240 - (103 * n ** 4) / 140;
  const b4 = (49561 * n ** 4) / 161280;

  const phi = latDeg * RAD;
  const dLon = (lngDeg - p.centralMeridian) * RAD;
  const s = Math.sin(phi);
  const phiStar =
    phi -
    Math.sin(phi) * Math.cos(phi) * (A + B * s ** 2 + C * s ** 4 + D * s ** 6);
  const xi = Math.atan(Math.tan(phiStar) / Math.cos(dLon));
  const eta = Math.atanh(Math.cos(phiStar) * Math.sin(dLon));

  const north =
    p.scaleFactor *
    aRoof *
    (xi +
      b1 * Math.sin(2 * xi) * Math.cosh(2 * eta) +
      b2 * Math.sin(4 * xi) * Math.cosh(4 * eta) +
      b3 * Math.sin(6 * xi) * Math.cosh(6 * eta) +
      b4 * Math.sin(8 * xi) * Math.cosh(8 * eta));
  const east =
    p.scaleFactor *
    aRoof *
    (eta +
      b1 * Math.cos(2 * xi) * Math.sinh(2 * eta) +
      b2 * Math.cos(4 * xi) * Math.sinh(4 * eta) +
      b3 * Math.cos(6 * xi) * Math.sinh(6 * eta) +
      b4 * Math.cos(8 * xi) * Math.sinh(8 * eta));

  return [east + p.falseEasting, north + p.falseNorthing];
}

/**
 * The same series backwards: the grid's east and north to latitude and longitude.
 *
 * @param p - The grid.
 * @param easting - Grid easting in metres.
 * @param northing - Grid northing in metres.
 * @returns The position in WGS84.
 */
export function unproject(
  p: TransverseMercator,
  easting: number,
  northing: number,
): LatLng {
  const { a, f } = p.ellipsoid;
  const e2 = f * (2 - f);
  const n = f / (2 - f);
  const aRoof = (a / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64);

  // Northings are counted from `latitudeOfOrigin`, not from the equator.
  // How far north it lies is easiest found with the forward series.
  const originNorth =
    p.latitudeOfOrigin === 0
      ? 0
      : project(
          { ...p, falseEasting: 0, falseNorthing: 0 },
          p.latitudeOfOrigin,
          p.centralMeridian,
        )[1];

  const xi =
    (northing - p.falseNorthing + originNorth) / (p.scaleFactor * aRoof);
  const eta = (easting - p.falseEasting) / (p.scaleFactor * aRoof);

  const d1 = n / 2 - (2 * n ** 2) / 3 + (37 * n ** 3) / 96 - n ** 4 / 360;
  const d2 = n ** 2 / 48 + n ** 3 / 15 - (437 * n ** 4) / 1440;
  const d3 = (17 * n ** 3) / 480 - (37 * n ** 4) / 840;
  const d4 = (4397 * n ** 4) / 161280;

  const xiPrim =
    xi -
    d1 * Math.sin(2 * xi) * Math.cosh(2 * eta) -
    d2 * Math.sin(4 * xi) * Math.cosh(4 * eta) -
    d3 * Math.sin(6 * xi) * Math.cosh(6 * eta) -
    d4 * Math.sin(8 * xi) * Math.cosh(8 * eta);
  const etaPrim =
    eta -
    d1 * Math.cos(2 * xi) * Math.sinh(2 * eta) -
    d2 * Math.cos(4 * xi) * Math.sinh(4 * eta) -
    d3 * Math.cos(6 * xi) * Math.sinh(6 * eta) -
    d4 * Math.cos(8 * xi) * Math.sinh(8 * eta);

  const phiStar = Math.asin(Math.sin(xiPrim) / Math.cosh(etaPrim));
  const dLon = Math.atan(Math.sinh(etaPrim) / Math.cos(xiPrim));

  // The step from conformal to geodetic latitude has a series of its own,
  // not the same as the other way: with the forward coefficients here the
  // latitude ends up over half an arc minute off, that is, over sixty metres.
  const A = e2 + e2 ** 2 + e2 ** 3 + e2 ** 4;
  const B = -(7 * e2 ** 2 + 17 * e2 ** 3 + 30 * e2 ** 4) / 6;
  const C = (224 * e2 ** 3 + 889 * e2 ** 4) / 120;
  const D = -(4279 * e2 ** 4) / 1260;
  const s = Math.sin(phiStar);
  const phi =
    phiStar +
    Math.sin(phiStar) *
      Math.cos(phiStar) *
      (A + B * s ** 2 + C * s ** 4 + D * s ** 6);

  return { lat: phi / RAD, lng: p.centralMeridian + dLon / RAD };
}

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
export function mapToWgs84(
  georef: MapGeoreference,
  east: number,
  north: number,
): LatLng {
  // The grivation is the angle from grid north to magnetic north, counted
  // clockwise, and the map is drawn with magnetic north up. Map north thus
  // lies at bearing `grivationDeg`, and map east at bearing
  // `grivationDeg + 90`; hence these two lines.
  const g = georef.grivationDeg * RAD;
  const cos = Math.cos(g);
  const sin = Math.sin(g);
  const gridEast = east * cos + north * sin;
  const gridNorth = -east * sin + north * cos;
  return unproject(
    georef.projection,
    georef.easting + gridEast,
    georef.northing + gridNorth,
  );
}

/**
 * `mapToWgs84` backwards: where on the map a point on earth lies, e.g. to
 * draw a phone's GPS position.
 *
 * @param georef - Where the map lies.
 * @param lat - Latitude in WGS84.
 * @param lng - Longitude in WGS84.
 * @returns Metres from the map's own origin, in the map's own directions.
 */
export function wgs84ToMap(
  georef: MapGeoreference,
  lat: number,
  lng: number,
): { east: number; north: number } {
  const [gridE, gridN] = project(georef.projection, lat, lng);
  const dE = gridE - georef.easting;
  const dN = gridN - georef.northing;
  // The same rotation as in `mapToWgs84`, the other way.
  const g = georef.grivationDeg * RAD;
  const cos = Math.cos(g);
  const sin = Math.sin(g);
  return { east: dE * cos - dN * sin, north: dE * sin + dN * cos };
}

/** For tests only: the forward series, so the conversion can be tested both ways. */
export const projectForTest = project;
