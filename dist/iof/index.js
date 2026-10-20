/**
 * IOF XML: the International Orienteering Federation's exchange format. The CourseData
 * reader and writer, with the courses in the same form as a ControlFreak file's
 * exchange section (see `CourseSet`), and the StartList reader, with the runners in the
 * package's own start list form (see `StartList`).
 */
export { looksLikeIofCourseData, readIofCourseData, } from "./course-data.js";
export { writeIofCourseData } from "./write-course-data.js";
export { looksLikeIofStartList, readIofStartList } from "./start-list.js";
export { isForkedCourse, } from "../courses.js";
export { FormatError } from "../errors.js";
export { decodeXmlBytes } from "../xml.js";
