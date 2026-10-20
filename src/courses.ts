/**
 * Courses read from a course file, whatever program wrote it.
 *
 * The readers of IOF XML CourseData files (`orienteering-formats/iof`) and Purple Pen
 * files (`orienteering-formats/purple-pen`) give their courses in the same form as the
 * exchange section of a ControlFreak file (`CourseExchange`, see `exchange.ts`), so an
 * app reads every course file the same way. A course set is a `CourseExchange` whose
 * courses carry a few more facts those files have and ControlFreak's files do not.
 *
 * Coordinates follow the exchange section's rule: x to the right, y downwards, in the
 * map units the file uses (millimetres on the printed map for IOF XML and Purple Pen,
 * so `map.metersPerUnit` is the scale denominator over 1000).
 */

import type { CourseExchange, ExchangeCourse } from "./exchange.js";

/**
 * A marked route (snitsel) on a leg of a course: IOF XML 3.0 writes it as a
 * `specialInstruction` on the control the leg leads to.
 */
export type CourseSetTapedRoute = {
  /** Index in the course's `controls` of the point the leg leads to. */
  to: number;
  /** `all` when the whole leg is taped, `funnel` when only a funnel at its end is. */
  kind: "all" | "funnel";
};

/** A course from a course file: an exchange course with the file's extra facts. */
export type CourseSetCourse = ExchangeCourse & {
  /**
   * IOF XML 3.0's `<CourseFamily>`. Courses that share a family are the variations of
   * one forked course, which the format writes as separate courses.
   */
  family?: string;
  /** Names of the classes the file assigns to this course, if any. */
  classNames?: string[];
  /**
   * `true` when the course is forked in the file but only its first variation could be
   * read (Purple Pen), so the app can tell the user.
   */
  partlyRead?: boolean;
  /** Legs with a marked route, when the file says so (IOF XML 3.0). */
  tapedRoutes?: CourseSetTapedRoute[];
};

/** Everything read from a course file. Usable wherever a `CourseExchange` is. */
export type CourseSet = Omit<CourseExchange, "courses"> & {
  courses: CourseSetCourse[];
};

/**
 * Whether a course is forked, in any of the ways a file can say it: variations listed,
 * only the first variation read, or a course family shared with other courses.
 */
export function isForkedCourse(set: CourseSet, course: CourseSetCourse): boolean {
  if ((course.variations?.length ?? 0) > 0 || course.partlyRead) return true;
  return (
    course.family !== undefined &&
    set.courses.filter((c) => c.family === course.family).length > 1
  );
}
