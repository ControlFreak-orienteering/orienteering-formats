/**
 * OCAD's course-setting files (.ocd). The courses come out in the same form as a
 * ControlFreak file's exchange section (see `CourseSet`).
 */
export { iofDescriptionRef, looksLikeOcad, readOcadCourses, type OcadCourses, type OcadDescription, type OcadSpecial, type OcadSpecialKind, } from "./courses.js";
export { isForkedCourse, type CourseSet, type CourseSetCourse } from "../courses.js";
export { FormatError, type FormatErrorCode } from "../errors.js";
