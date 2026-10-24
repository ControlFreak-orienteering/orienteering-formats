/**
 * IOF XML: the International Orienteering Federation's exchange format. The CourseData
 * reader and writer, with the courses in the same form as a ControlFreak file's
 * exchange section (see `CourseSet`), and the StartList reader, with the runners in the
 * package's own start list form (see `StartList`), and the StartList writer, which writes
 * that form as the 3.0 file Eventor imports.
 */
export { looksLikeIofCourseData, readIofCourseData, } from "./course-data.js";
export { writeIofCourseData } from "./write-course-data.js";
export { looksLikeIofStartList, readIofStartList } from "./start-list.js";
export { splitRunnerName, writeIofStartList, } from "./write-start-list.js";
export { isForkedCourse, joinCourseFamilies, } from "../courses.js";
export { FormatError } from "../errors.js";
export { decodeXmlBytes } from "../xml.js";
