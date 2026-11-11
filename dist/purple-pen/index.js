/**
 * Purple Pen's project files (.ppen). The courses come out in the same form as a
 * ControlFreak file's exchange section (see `CourseSet`), and `writePurplePen` writes that
 * form back as a .ppen.
 */
export { looksLikePurplePen, readPurplePen, } from "./purple-pen.js";
export { writePurplePen, } from "./write-purple-pen.js";
export { isForkedCourse } from "../courses.js";
export { FormatError } from "../errors.js";
export { decodeXmlBytes } from "../xml.js";
