/**
 * IOF XML: the International Orienteering Federation's exchange format. Today the
 * CourseData reader; the courses come out in the same form as a ControlFreak file's
 * exchange section (see `CourseSet`).
 */
export {
  looksLikeIofCourseData,
  readIofCourseData,
  type IofCourseData,
  type IofVersion,
  type ReadIofOptions,
} from "./course-data.js";
export { isForkedCourse, type CourseSet, type CourseSetCourse } from "../courses.js";
export { FormatError, type FormatErrorCode } from "../errors.js";
export { decodeXmlBytes, type XmlParse } from "../xml.js";
