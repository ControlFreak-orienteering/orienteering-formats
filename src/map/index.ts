/**
 * Public interface of `orienteering-formats/map`: reading OCAD and OpenOrienteering
 * Mapper map files, drawing them as SVG, cropping them, and converting between map and
 * earth coordinates.
 *
 * It is a separate entry point from the file formats (`orienteering-formats`), so an app
 * that only reads `.cfpack`/`.cfproj` files does not bundle the map reader.
 *
 * Most apps need only `readMapFile`; the lower-level readers are exported for apps that
 * work with the parsed map itself (as ControlFreak does).
 */
export {
  MapError,
  mapFileFormat,
  mapSvgMarkup,
  readMapFile,
  type MapDrawing,
  type MapErrorCode,
  type MapFileFormat,
  type ReadMapOptions,
} from "./read-map.js";
export {
  mapToWgs84,
  projectForTest,
  projectionForEpsg,
  projectionForOcadGrid,
  projectionFromProj4,
  unproject,
  utmProjection,
  wgs84ToMap,
  type Ellipsoid,
  type LatLng,
  type MapGeoreference,
  type TransverseMercator,
} from "./georeference.js";
export { cmykToRgb } from "./ocad/colors.js";
export { cropOcad, OcadCropError, type OcadRect } from "./ocad/crop.js";
export { parseOcadFile } from "./ocad/parser.js";
export {
  escapeXml,
  renderMapSvg,
  type RenderedMap,
  type RenderOptions,
} from "./ocad/render-svg.js";
export type {
  AreaSymbol,
  GeoReference,
  LineSymbol,
  MapObject,
  ObjectKind,
  OcadColor,
  OcadPoint,
  OcadSymbol,
  ParsedOcadMap,
  PointSymbol,
  PointSymbolElement,
  SymbolBase,
  SymbolKind,
  TextSymbol,
  UnsupportedSymbol,
} from "./ocad/types.js";
export { renderOmap, type OmapRender } from "./omap.js";
export { cropOmapDoc, cropOmapXml, type OmapRect } from "./omap-crop.js";
