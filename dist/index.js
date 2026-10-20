/**
 * Public interface of orienteering-formats. Apps import only from here.
 */
export { CFPACK_FILE_EXTENSION, CFPACK_MAGIC, cfpackFileName, hasCfpackMagic, looksLikeCfpack, readCfpack, writeCfpack, } from "./cfpack.js";
export { CFPROJ_FILE_EXTENSION, createProjectEnvelope, envelopeToJson, parseProjectEnvelope, projectFileName, PROJECT_FORMAT, PROJECT_FORMAT_VERSION, readProjectFile, writeProjectFile, } from "./cfproj.js";
export { isForkedCourse } from "./courses.js";
export { FormatError } from "./errors.js";
export { parseCourseExchange, } from "./exchange.js";
export { decodeXmlBytes } from "./xml.js";
