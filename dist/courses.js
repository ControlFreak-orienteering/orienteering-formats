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
/**
 * Whether a course is forked, in any of the ways a file can say it: variations listed,
 * only the first variation read, or a course family shared with other courses.
 */
export function isForkedCourse(set, course) {
    if ((course.variations?.length ?? 0) > 0 || course.partlyRead)
        return true;
    return (course.family !== undefined &&
        set.courses.filter((c) => c.family === course.family).length > 1);
}
/**
 * The code of one course of a family as a variation: its name without the family's name
 * and the separator after it ("Stafett A" in "Stafett" is "A"), or the whole name when
 * it does not start with the family's.
 */
function variationCodeOf(name, family) {
    if (!name.startsWith(family))
        return name;
    return name.slice(family.length).replace(/^[\s.\-_:/]+/, "") || name;
}
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
export function joinCourseFamilies(set) {
    const families = new Map();
    for (const course of set.courses) {
        if (course.family === undefined || (course.variations?.length ?? 0) > 0)
            continue;
        families.set(course.family, [...(families.get(course.family) ?? []), course]);
    }
    // Where each course ends up: its own id, or the joined course and a variation code.
    const placed = new Map();
    const courses = [];
    for (const course of set.courses) {
        const members = course.family === undefined ? undefined : families.get(course.family);
        if (!members || members.length < 2) {
            courses.push(course);
            placed.set(course.name, { courseId: course.id });
            continue;
        }
        // The whole family goes in where its first course was.
        if (members[0] !== course)
            continue;
        const family = course.family;
        const id = `family:${family}`;
        const used = new Set();
        const variations = members.map((member, i) => {
            let code = variationCodeOf(member.name, family);
            if (used.has(code))
                code = member.name;
            if (used.has(code))
                code = `${member.name} (${i + 1})`;
            used.add(code);
            placed.set(member.name, { courseId: id, variationCode: code });
            return {
                code,
                controls: member.controls,
                ...(member.lengthMeters !== undefined ? { lengthMeters: member.lengthMeters } : {}),
            };
        });
        const classNames = [...new Set(members.flatMap((m) => m.classNames ?? []))];
        const { family: _family, classNames: _classNames, ...first } = course;
        courses.push({
            ...first,
            id,
            name: family,
            variations,
            ...(classNames.length > 0 ? { classNames } : {}),
        });
    }
    return {
        ...set,
        courses,
        ...(set.teamCourses
            ? {
                teamCourses: set.teamCourses.map((team) => ({
                    ...team,
                    members: team.members.map((member) => ({
                        ...member,
                        ...placed.get(member.courseName),
                    })),
                })),
            }
            : {}),
    };
}
