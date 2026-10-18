/**
 * Frozen test vectors for the course links of virtual controls (orienteering-formats/run).
 *
 * DO NOT CHANGE OR REMOVE THESE VECTORS. ONLY ADD NEW ONES.
 * (The pre-release `#c=` vectors were removed in v0.7.0 together with their support;
 * the format of v0.6.0 is the first one guaranteed.)
 *
 * Each vector is a payload or link that has been released and may be printed as a QR code
 * on a map. Printed codes live for months, so every later release must decode every vector
 * here to exactly the course given. If a vector fails, the change is wrong, not the vector.
 * A new format version, flag or link form gets a new vector here in the release that
 * introduces it.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decodeRunCourse,
  RUN_URL_PREFIX,
  runCourseFromHash,
} from "../dist/run/index.js";

/** The course of the vectors for a course with a fixed order. */
const TESTBANA = Object.freeze({
  v: 1,
  name: "Testbana",
  start: { lat: 61.3, lng: 17.06 },
  controls: [
    { code: 31, lat: 61.3021, lng: 17.0635 },
    { code: 45, lat: 61.3048, lng: 17.0592 },
    { code: 102, lat: 61.3015, lng: 17.055 },
  ],
  finish: { lat: 61.3002, lng: 17.0605 },
  score: null,
});

/** Reads a whole link the way a browser hands the fragment to the runner app. */
const fromLink = (link) => runCourseFromHash(new URL(link).hash);

// Version 1 alphanumeric payload, course with a fixed order (v0.6.0).
test("frozen: v0.6.0 course with a fixed order", () => {
  const payload = "160P61:1E+4G2LD9MDZ/MLX0HBM160GG4AM0ZU0$PL/DUT8EHY0X+0SG080";
  assert.deepEqual(decodeRunCourse(payload), TESTBANA);
  assert.deepEqual(runCourseFromHash(`#${payload}`), TESTBANA);
  assert.equal(RUN_URL_PREFIX, "https://run.controlfreak.se/#");
  assert.deepEqual(fromLink(`https://run.controlfreak.se/#${payload}`), TESTBANA);
});

// Version 1 alphanumeric payload, score course (v0.6.0).
test("frozen: v0.6.0 score course", () => {
  const payload = "560HI1GKF.WMLDE2LDNJDLX0Z/MLX0HBM1601D4JUMG1QQA6$PL/DUI6ECFK+NR/5IUAS";
  const course = {
    v: 1,
    name: "Poängbana",
    start: { lat: 61.3, lng: 17.06 },
    controls: [
      { code: 31, points: 20, lat: 61.3021, lng: 17.0635 },
      { code: 45, points: 30, lat: 61.3048, lng: 17.0592 },
      { code: 102, points: 50, lat: 61.3015, lng: 17.055 },
    ],
    finish: { lat: 61.3002, lng: 17.0605 },
    score: { timeLimitMinutes: 45, penaltyPerMinute: 5 },
  };
  assert.deepEqual(decodeRunCourse(payload), course);
  assert.deepEqual(fromLink(`https://run.controlfreak.se/#${payload}`), course);
});
