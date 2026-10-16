import type { ParameterString } from "./parameter-strings.js";
import type { GeoReference } from "./types.js";
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
export declare function readGeoReference(parameterStrings: Map<number, ParameterString[]>): GeoReference | null;
