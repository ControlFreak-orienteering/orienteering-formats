/**
 * The course format in the QR links for virtual controls (run.controlfreak.se). A separate
 * entry point, so that apps which only read course files do not carry it.
 */
export { FormatError, type FormatErrorCode } from "../errors.js";
export { decodeRunCourse, encodeRunCourse, RUN_FORMAT_VERSION, RUN_ORIGIN, RUN_PATH, RUN_PAYLOAD_ALPHABET, RUN_URL_PREFIX, runCourseFromHash, runCourseQrSegments, runCourseUrl, type RunControl, type RunCourse, type RunPoint, type RunQrSegments, type RunScore, } from "./course.js";
export { OPEN_COURSE_ID_LENGTH, openCourseId, openCourseKey } from "./open-course.js";
