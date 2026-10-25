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
export { MapError, mapFileFormat, mapSvgMarkup, readMapFile, } from "./read-map.js";
export { mapToWgs84, projectForTest, projectionForEpsg, projectionForOcadGrid, projectionFromProj4, unproject, utmProjection, wgs84ToMap, } from "./georeference.js";
export { cmykToRgb } from "./ocad/colors.js";
export { cropOcad, OcadCropError } from "./ocad/crop.js";
export { parseOcadFile } from "./ocad/parser.js";
export { escapeXml, renderMapSvg, } from "./ocad/render-svg.js";
export { renderOmap } from "./omap.js";
export { parseOmapModel, } from "./omap-model.js";
export { cropOmapDoc, cropOmapXml } from "./omap-crop.js";
