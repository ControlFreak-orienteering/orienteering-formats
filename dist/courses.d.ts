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
/**
 * The course one runner of a relay team runs, from IOF XML 3.0's
 * `<TeamMemberCourseAssignment>`. Course-setting programs (OCAD, Condes, MeOS) write one
 * per leg when they spread the variations of forked courses over the teams (the teams'
 * forking keys), so the timing system knows which map each runner gets.
 */
export type CourseSetTeamMemberCourse = {
    /** The leg, from 1. Missing when the file names the runner instead. */
    leg?: number;
    /** Which of several runners side by side on the same leg, from 1. */
    legOrder?: number;
    /** The runner's bib, when the file gives one. */
    bib?: string;
    /** The runner's name, when the file gives one. */
    memberName?: string;
    /** The course's name: for a forked course, the name of one variation's `<Course>`. */
    courseName: string;
    /** The family of the course (see `CourseSetCourse.family`), when the file gives one. */
    courseFamily?: string;
    /**
     * Set by `joinCourseFamilies`: the id of the course in the joined set, absent when no
     * course has `courseName`.
     */
    courseId?: string;
    /** Set by `joinCourseFamilies`: the variation's code when that course is forked. */
    variationCode?: string;
};
/**
 * The courses of one relay team, from IOF XML 3.0's `<TeamCourseAssignment>`. A file
 * names the team by bib, by name and class, or both.
 */
export type CourseSetTeamCourses = {
    /** The team's bib (start number), when the file gives one. */
    bib?: string;
    /** The team's name, when the file gives one. */
    teamName?: string;
    /** The team's class, when the file gives one. */
    className?: string;
    /** The course of each runner, in the file's order. */
    members: CourseSetTeamMemberCourse[];
};
/** Everything read from a course file. Usable wherever a `CourseExchange` is. */
export type CourseSet = Omit<CourseExchange, "courses"> & {
    courses: CourseSetCourse[];
    /** Which course each relay team's runners run, when the file says (IOF XML 3.0). */
    teamCourses?: CourseSetTeamCourses[];
};
/**
 * Whether a course is forked, in any of the ways a file can say it: variations listed,
 * only the first variation read, or a course family shared with other courses.
 */
export declare function isForkedCourse(set: CourseSet, course: CourseSetCourse): boolean;
/**
 * Joins the courses that share a `family` into one forked course, the form ControlFreak
 * files and IOF XML 2.0.3 have: IOF XML 3.0 writes each variation of a forked course as a
 * course of its own in a `<CourseFamily>`.
 *
 * The joined course is named after the family, has the id `family:<family>`, takes its
 * order, controls, length, climb, scores and marked routes from the family's first
 * course, and has one variation per course, coded by the course's name without the
 * family's (see `variationCodeOf`). The class names of all of them are joined. A family
 * with a single course is left as it is. The `teamCourses` members get `courseId` and
 * `variationCode`, so an app can find each runner's variation.
 *
 * @param set - Courses as read, e.g. by `readIofCourseData`.
 * @returns A new set; `set` is not changed.
 */
export declare function joinCourseFamilies(set: CourseSet): CourseSet;
