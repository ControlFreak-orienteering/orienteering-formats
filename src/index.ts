/**
 * Public interface of orienteering-formats. Apps import only from here.
 */
export {
  CFPACK_FILE_EXTENSION,
  CFPACK_MAGIC,
  cfpackFileName,
  hasCfpackMagic,
  looksLikeCfpack,
  readCfpack,
  writeCfpack,
  type CfpackContents,
  type MapToPack,
  type PackedMap,
} from "./cfpack.js";
export {
  CFPROJ_FILE_EXTENSION,
  createProjectEnvelope,
  envelopeToJson,
  parseProjectEnvelope,
  projectFileName,
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  readProjectFile,
  writeProjectFile,
  type ProjectEnvelope,
  type ProjectInfo,
} from "./cfproj.js";
export {
  isForkedCourse,
  joinCourseFamilies,
  type CourseSet,
  type CourseSetCourse,
  type CourseSetTapedRoute,
  type CourseSetTeamCourses,
  type CourseSetTeamMemberCourse,
} from "./courses.js";
export { FormatError, type FormatErrorCode } from "./errors.js";
export {
  parseCourseExchange,
  type CourseExchange,
  type ExchangeControl,
  type ExchangeControlKind,
  type ExchangeCourse,
  type ExchangeCourseOrder,
  type ExchangeGeoreference,
  type ExchangeMap,
  type ExchangeProjection,
  type ExchangeVariation,
} from "./exchange.js";
export { decodeXmlBytes, type XmlParse } from "./xml.js";
