import { describe, expect, it } from "vitest";

import { isForkedCourse, joinCourseFamilies, type CourseSet } from "./courses.js";

const course = (id: string, name: string, family?: string, classNames?: string[]) => ({
  id,
  name,
  order: "fixed" as const,
  controls: ["S1", id, "F1"],
  lengthMeters: 1000 + Number(id),
  ...(family ? { family } : {}),
  ...(classNames ? { classNames } : {}),
});

// As IOF XML 3.0 writes a relay's forked course: one course per variation in a family.
const SET: CourseSet = {
  controls: [],
  courses: [
    course("1", "Kort"),
    course("31", "Stafett A", "Stafett", ["H21"]),
    course("32", "Stafett B", "Stafett", ["H21", "D21"]),
    course("33", "Ensam 1", "Ensam"),
    course("34", "Stafett", "Stafett"),
  ],
  teamCourses: [
    {
      bib: "1",
      members: [
        { leg: 1, courseName: "Stafett B" },
        { leg: 2, courseName: "Kort" },
        { leg: 3, courseName: "Saknas" },
      ],
    },
  ],
};

describe("joinCourseFamilies", () => {
  const joined = joinCourseFamilies(SET);

  it("joins a family into one forked course where its first course was", () => {
    expect(joined.courses.map((c) => c.id)).toEqual(["1", "family:Stafett", "33"]);
    const relay = joined.courses[1]!;
    expect(relay).toMatchObject({
      name: "Stafett",
      controls: ["S1", "31", "F1"],
      lengthMeters: 1031,
      classNames: ["H21", "D21"],
    });
    expect(relay.family).toBeUndefined();
    // The code is the name without the family's; a name that is all family keeps itself.
    expect(relay.variations).toEqual([
      { code: "A", controls: ["S1", "31", "F1"], lengthMeters: 1031 },
      { code: "B", controls: ["S1", "32", "F1"], lengthMeters: 1032 },
      { code: "Stafett", controls: ["S1", "34", "F1"], lengthMeters: 1034 },
    ]);
    expect(isForkedCourse(joined, relay)).toBe(true);
  });

  it("leaves a family of one as it is", () => {
    expect(joined.courses[2]).toEqual(SET.courses[3]);
  });

  it("tells each team member's course and variation", () => {
    expect(joined.teamCourses![0]!.members).toEqual([
      { leg: 1, courseName: "Stafett B", courseId: "family:Stafett", variationCode: "B" },
      { leg: 2, courseName: "Kort", courseId: "1" },
      { leg: 3, courseName: "Saknas" },
    ]);
  });

  it("does not change the set it was given", () => {
    expect(SET.courses).toHaveLength(5);
    expect(SET.teamCourses![0]!.members[0]).toEqual({ leg: 1, courseName: "Stafett B" });
  });
});
