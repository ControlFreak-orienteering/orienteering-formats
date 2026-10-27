import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  encodeRunCourse,
  OPEN_COURSE_ID_LENGTH,
  openCourseId,
  openCourseKey,
  runCourseUrl,
} from "../dist/run/index.js";

const course = (over = {}) => ({
  v: 1,
  name: "Blå 5 km",
  start: { lat: 60.6029, lng: 17.0598 },
  controls: [
    { code: 31, lat: 60.60512, lng: 17.06321 },
    { code: 45, lat: 60.60733, lng: 17.06012 },
    { code: 102, lat: 60.6041, lng: 17.0688 },
  ],
  finish: { lat: 60.6032, lng: 17.0601 },
  score: null,
  ...over,
});

const scoreCourse = (controls) =>
  course({ controls, score: { timeLimitMinutes: 45, penaltyPerMinute: 2 }, finish: null });

test("the id is the start of the SHA-256 of the canonical text", () => {
  const c = course();
  assert.equal(
    openCourseKey(c),
    "oc1|f|6060290,1705980|31,6060512,1706321;45,6060733,1706012;102,6060410,1706880|6060320,1706010",
  );
  const id = openCourseId(c);
  assert.equal(id.length, OPEN_COURSE_ID_LENGTH);
  assert.equal(id, createHash("sha256").update(openCourseKey(c)).digest("hex").slice(0, 16));
  assert.equal(openCourseKey(course({ start: null, finish: null })).endsWith("|"), true);
});

test("the hash is SHA-256 also over several blocks and UTF-8", () => {
  // Many controls make a key far over one 64-byte block; the check is against node's SHA-256.
  for (const n of [0, 1, 2, 3, 4, 50, 300]) {
    const c = course({
      controls: Array.from({ length: n }, (_, i) => ({ code: 31 + i, lat: 60 + i * 1e-4, lng: 17 - i * 1e-4 })),
    });
    assert.equal(openCourseId(c), createHash("sha256").update(openCourseKey(c)).digest("hex").slice(0, 16));
  }
});

test("two links of the same course give the same id", () => {
  const c = course();
  const id = openCourseId(c);
  const payload = encodeRunCourse(c);
  assert.equal(openCourseId(payload), id, "the payload");
  assert.equal(openCourseId("#" + payload), id, "location.hash");
  assert.equal(openCourseId(runCourseUrl(c)), id, "the whole link");
  // Another link of the same course: renamed, and positions that differ by less than the grid.
  const renamed = course({
    name: "Blue 5 km (new print)",
    controls: c.controls.map((x) => ({ ...x, lat: x.lat + 0.3e-5, lng: x.lng - 0.3e-5 })),
  });
  assert.notEqual(encodeRunCourse(renamed), payload);
  assert.equal(openCourseId(encodeRunCourse(renamed)), id);
});

test("a moved control, another code, start or finish gives another id", () => {
  const id = openCourseId(course());
  const moved = (dLat, dLng) =>
    openCourseId(course({ controls: course().controls.map((x, i) => (i === 1 ? { ...x, lat: x.lat + dLat, lng: x.lng + dLng } : x)) }));
  // 1e-5 degrees of latitude is 1.1 m; 2e-5 of longitude at 60° is 1.1 m.
  assert.notEqual(moved(1e-5, 0), id);
  assert.notEqual(moved(0, 2e-5), id);
  assert.notEqual(openCourseId(course({ controls: course().controls.map((x, i) => (i === 0 ? { ...x, code: 32 } : x)) })), id);
  assert.notEqual(openCourseId(course({ controls: [...course().controls].reverse() })), id, "order matters on a fixed course");
  assert.notEqual(openCourseId(course({ controls: course().controls.slice(1) })), id);
  assert.notEqual(openCourseId(course({ start: null })), id);
  assert.notEqual(openCourseId(course({ finish: { lat: 60.6033, lng: 17.0601 } })), id);
});

test("score courses: order does not matter, points and rules do", () => {
  const controls = [
    { code: 31, points: 10, lat: 60.60512, lng: 17.06321 },
    { code: 45, points: 20, lat: 60.60733, lng: 17.06012 },
    { code: 102, points: 30, lat: 60.6041, lng: 17.0688 },
  ];
  const id = openCourseId(scoreCourse(controls));
  assert.equal(openCourseId(scoreCourse([controls[2], controls[0], controls[1]])), id);
  assert.notEqual(openCourseId(scoreCourse(controls.map((c, i) => (i ? c : { ...c, points: 11 })))), id);
  assert.notEqual(openCourseId({ ...scoreCourse(controls), score: { timeLimitMinutes: 60, penaltyPerMinute: 2 } }), id);
  assert.notEqual(openCourseId({ ...scoreCourse(controls), score: { timeLimitMinutes: 45, penaltyPerMinute: 3 } }), id);
  assert.notEqual(openCourseId({ ...scoreCourse(controls), score: null }), id, "a fixed course with the same controls");
  // Through a link, too: the decoder fills in the points.
  assert.equal(openCourseId(encodeRunCourse(scoreCourse([controls[1], controls[2], controls[0]]))), id);
});

test("a link without a readable course has no id", () => {
  assert.equal(openCourseId(""), null);
  assert.equal(openCourseId("#"), null);
  assert.equal(openCourseId("#ZZZZ"), null);
  assert.equal(openCourseId("#c=abc"), null);
});
