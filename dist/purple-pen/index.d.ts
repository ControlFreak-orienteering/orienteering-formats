/**
 * Purple Pen's project files (.ppen). The courses come out in the same form as a
 * ControlFreak file's exchange section (see `CourseSet`), and `writePurplePen` writes that
 * form back as a .ppen.
 */
export { looksLikePurplePen, readPurplePen, type PurplePenCourses, type ReadPurplePenOptions, } from "./purple-pen.js";
export { writePurplePen, type PurplePenLayout, type PurplePenNote, type WritePurplePenOptions, } from "./write-purple-pen.js";
export { isForkedCourse, type CourseSet, type CourseSetCourse } from "../courses.js";
export { FormatError, type FormatErrorCode } from "../errors.js";
export { decodeXmlBytes, type XmlParse } from "../xml.js";
