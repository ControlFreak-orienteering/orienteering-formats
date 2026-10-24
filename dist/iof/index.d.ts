/**
 * IOF XML: the International Orienteering Federation's exchange format. The CourseData
 * reader and writer, with the courses in the same form as a ControlFreak file's
 * exchange section (see `CourseSet`), and the StartList reader, with the runners in the
 * package's own start list form (see `StartList`), and the StartList writer, which writes
 * that form as the 3.0 file Eventor imports.
 */
export { looksLikeIofCourseData, readIofCourseData, type IofCourseData, type IofVersion, type ReadIofOptions, } from "./course-data.js";
export { writeIofCourseData, type WriteIofOptions } from "./write-course-data.js";
export { looksLikeIofStartList, readIofStartList, type IofStartList } from "./start-list.js";
export { splitRunnerName, writeIofStartList, type WriteIofStartListOptions, } from "./write-start-list.js";
export { isForkedCourse, joinCourseFamilies, type CourseSet, type CourseSetCourse, type CourseSetTapedRoute, type CourseSetTeamCourses, type CourseSetTeamMemberCourse, } from "../courses.js";
export type { StartList, StartListRunner } from "../start-list.js";
export { FormatError, type FormatErrorCode } from "../errors.js";
export { decodeXmlBytes, type XmlParse } from "../xml.js";
