import { describe, expect, it } from "vitest";
import {
  mapToWgs84,
  projectForTest,
  projectionForEpsg,
  projectionForOcadGrid,
  projectionFromProj4,
  unproject,
  utmProjection,
  wgs84ToMap,
  type MapGeoreference,
} from "./georeference.js";

const SWEREF99TM = projectionForEpsg(3006)!;

/**
 * A reference point from an OpenOrienteering Mapper file. The file carries
 * the same point twice, once in the grid and once in degrees, and that is
 * the best check there is: the numbers come from Mapper, not from this
 * code, and each one gives the other.
 */
const REF = {
  easting: 610000,
  northing: 6799000,
  lat: 61.30957535,
  lng: 17.05405951,
};

/** The distance between two positions in metres, roughly, at that latitude. */
const metersApart = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot(
    (a.lat - b.lat) * 111132,
    (a.lng - b.lng) * 111320 * Math.cos((b.lat * Math.PI) / 180),
  );

describe("unproject", () => {
  it("ger kartfilens egen referenspunkt i grader", () => {
    const got = unproject(SWEREF99TM, REF.easting, REF.northing);
    expect(metersApart(got, REF)).toBeLessThan(0.01);
  });

  it("undoes what the forward projection gave", () => {
    for (const p of [SWEREF99TM, utmProjection(33, false)!, projectionForEpsg(3013)!]) {
      for (const point of [
        { lat: 55.6, lng: 13.0 },
        { lat: 61.3, lng: 17.05 },
        { lat: 68.4, lng: 22.1 },
      ]) {
        const [e, n] = projectForTest(p, point.lat, point.lng);
        expect(metersApart(unproject(p, e, n), point)).toBeLessThan(0.01);
      }
    }
  });

  it("is right south of the equator", () => {
    const p = utmProjection(56, true)!;
    const point = { lat: -33.86, lng: 151.21 };
    const [e, n] = projectForTest(p, point.lat, point.lng);
    expect(n).toBeGreaterThan(0); // false northing, not a negative number
    expect(metersApart(unproject(p, e, n), point)).toBeLessThan(0.01);
  });
});

describe("which grids can be converted", () => {
  it("recognises OCAD's grid numbers", () => {
    // The grid in the thousands, the zone in the rest. 13002 = Sweden, zone 2.
    expect(projectionForOcadGrid(13002)).toEqual(projectionForEpsg(3006));
    expect(projectionForOcadGrid(13009)).toEqual(projectionForEpsg(3013));
    expect(projectionForOcadGrid(2033)).toEqual(utmProjection(33, false));
    expect(projectionForOcadGrid(6005)).toEqual(projectionForEpsg(3067));
  });

  it("reads a negative number as the southern hemisphere", () => {
    expect(projectionForOcadGrid(-2056)).toEqual(utmProjection(56, true));
    expect(projectionForOcadGrid(-2056)?.falseNorthing).toBe(10_000_000);
  });

  it("refuses grids that would need a datum transformation", () => {
    // RT 90, KKJ, NGO 1948, ED 50, OSGB: coordinates on older datums end up
    // hundreds of metres off if treated as WGS84.
    for (const grid of [13001, 6002, 12001, 12011, 5000, 8003, 14001, 7001, 0, 1001]) {
      expect(projectionForOcadGrid(grid)).toBeNull();
    }
  });

  it("reads Mapper's PROJ.4 strings", () => {
    expect(projectionFromProj4("+init=epsg:3006")).toEqual(SWEREF99TM);
    expect(projectionFromProj4("+proj=utm +zone=33 +datum=WGS84 +units=m")).toEqual(
      utmProjection(33, false),
    );
    expect(projectionFromProj4("+proj=utm +zone=56 +south +datum=WGS84")).toEqual(
      utmProjection(56, true),
    );
    // A spelled-out transverse Mercator needs no table at all.
    expect(
      projectionFromProj4(
        "+proj=tmerc +lat_0=0 +lon_0=15 +k=0.9996 +x_0=500000 +y_0=0 +ellps=GRS80",
      ),
    ).toEqual(SWEREF99TM);
  });

  it("refuses a PROJ.4 string on another datum or with another projection", () => {
    expect(
      projectionFromProj4("+proj=tmerc +lon_0=15 +ellps=bessel +towgs84=414,41,603"),
    ).toBeNull();
    expect(projectionFromProj4("+proj=lcc +lat_1=49 +lon_0=3 +ellps=GRS80")).toBeNull();
  });
});

describe("mapToWgs84", () => {
  const georef: MapGeoreference = {
    easting: REF.easting,
    northing: REF.northing,
    grivationDeg: 0,
    projection: SWEREF99TM,
  };

  it("puts the map's origin at the reference point", () => {
    expect(metersApart(mapToWgs84(georef, 0, 0), REF)).toBeLessThan(0.01);
  });

  it("moves north when the map does", () => {
    const north = mapToWgs84(georef, 0, 1000);
    expect(north.lat).toBeGreaterThan(REF.lat);
    expect(metersApart(north, REF)).toBeCloseTo(1000, -1);
  });

  /**
   * The grivation is the angle from grid north to map north, clockwise. A
   * quarter turn should therefore put map north straight east in the grid.
   */
  it("rotates the map against the grid", () => {
    const rotated = { ...georef, grivationDeg: 90 };
    const straightEast = unproject(SWEREF99TM, REF.easting + 1000, REF.northing);
    expect(metersApart(mapToWgs84(rotated, 0, 1000), straightEast)).toBeLessThan(0.01);
  });
});

/**
 * All the way, against real numbers: a control in a Purple Pen course file
 * lies 2.57 mm east and 303.58 mm south of the map's origin on a map sheet
 * at 1:5 000, and Purple Pen has itself worked out where that is.
 */
describe("against Purple Pen's own coordinates", () => {
  it("lands on the same point", () => {
    const georef: MapGeoreference = {
      easting: REF.easting,
      northing: REF.northing,
      grivationDeg: 0,
      projection: SWEREF99TM,
    };
    const mm = { x: 2.57, y: -303.58 };
    const got = mapToWgs84(georef, (mm.x * 5000) / 1000, (mm.y * 5000) / 1000);
    const purplePen = { lat: 61.295953601014112, lng: 17.053408981162814 };
    // The file's millimetres have two decimals, so 5 cm resolution.
    expect(metersApart(got, purplePen)).toBeLessThan(0.1);
  });
});

describe("wgs84ToMap", () => {
  const georef: MapGeoreference = {
    easting: REF.easting,
    northing: REF.northing,
    grivationDeg: 1.8,
    projection: SWEREF99TM,
  };

  it("puts the reference point at the map's origin", () => {
    const got = wgs84ToMap(georef, REF.lat, REF.lng);
    expect(Math.hypot(got.east, got.north)).toBeLessThan(0.01);
  });

  it("undoes what mapToWgs84 gave, rotated map and all", () => {
    for (const [east, north] of [
      [0, 1000],
      [-750, 320],
      [1200, -2400],
    ] as const) {
      const { lat, lng } = mapToWgs84(georef, east, north);
      const back = wgs84ToMap(georef, lat, lng);
      expect(Math.hypot(back.east - east, back.north - north)).toBeLessThan(0.01);
    }
  });
});

describe("the datum in a PROJ.4 string", () => {
  it("accepts a missing datum, which PROJ takes as WGS84", () => {
    expect(projectionFromProj4("+proj=utm +zone=33")).toEqual(utmProjection(33, false));
  });

  it("refuses UTM on an older datum", () => {
    // ED 50 / UTM 33N: the same grid, but the coordinates lie over a
    // hundred metres from WGS84's.
    expect(projectionFromProj4("+proj=utm +zone=33 +ellps=intl +towgs84=-87,-98,-121")).toBeNull();
  });

  it("accepts a towgs84 of only zeros", () => {
    expect(projectionFromProj4("+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0")).toEqual(
      utmProjection(33, false),
    );
  });
});
