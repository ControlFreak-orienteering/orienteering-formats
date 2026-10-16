import type { ParameterString } from "./parameter-strings.js";
import type { GeoReference } from "./types.js";

const SCALE_RECORD_TYPE = 1039;

/**
 * Reads the map's scale/georeferencing parameter string (record type 1039):
 * real-world offset (x/y), map scale (m), whether the coordinates are
 * real-world ones (r), the grid identifier (i) and the grivation (a,
 * degrees). See the OCAD file format wiki's "String type 1039" reference.
 *
 * `i` carries the grid and the zone in one number — the grid in the
 * thousands, the zone in the rest — and is what says which projection the
 * offset is expressed in. See `projectionForOcadGrid` in
 * `georeference.ts`.
 */
export function readGeoReference(
  parameterStrings: Map<number, ParameterString[]>,
): GeoReference | null {
  const entry = parameterStrings.get(SCALE_RECORD_TYPE)?.[0];
  if (!entry) return null;

  const mapScale = Number(entry.fields.get("m") ?? 0) || 0;
  const easting = Number(entry.fields.get("x") ?? 0) || 0;
  const northing = Number(entry.fields.get("y") ?? 0) || 0;
  const scale = Number(entry.fields.get("u") ?? 1) || 1;
  const grivationDeg = Number(entry.fields.get("a") ?? 0) || 0;
  const gridAndZone = Number(entry.fields.get("i") ?? 0) || 0;

  return {
    easting,
    northing,
    scale,
    mapScale,
    grivationRad: (grivationDeg / 180) * Math.PI,
    gridAndZone,
    realWorldCoords: (entry.fields.get("r") ?? "") === "1",
  };
}
