/**
 * IOF XML: the International Orienteering Federation's exchange format. Today the
 * CourseData reader; the courses come out in the same form as a ControlFreak file's
 * exchange section (see `CourseSet`).
 */
export { looksLikeIofCourseData, readIofCourseData, } from "./course-data.js";
export { isForkedCourse } from "../courses.js";
export { FormatError } from "../errors.js";
export { decodeXmlBytes } from "../xml.js";
