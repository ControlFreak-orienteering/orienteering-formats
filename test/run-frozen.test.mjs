/**
 * Frozen test vectors for the course links of virtual controls (orienteering-formats/run).
 *
 * DO NOT CHANGE OR REMOVE THESE VECTORS. ONLY ADD NEW ONES.
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
  decodeLegacyRunCourse,
  decodeRunCourse,
  RUN_LEGACY_URL_PREFIXES,
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

// (a) Legacy format, written by the apps before v0.6.0: base64url after `#c=`, read-only.
test("frozen: legacy #c= base64url course (before v0.6.0)", () => {
  const value = "AQMIVGVzdGJhbmGgpewFoKDQAQMfpAO8BS2cBNsGZpMFxwaDAswI";
  assert.deepEqual(decodeLegacyRunCourse(value), TESTBANA);
  assert.deepEqual(runCourseFromHash(`#c=${value}`), TESTBANA);
  assert.deepEqual(fromLink(`https://run.controlfreak.se/#c=${value}`), TESTBANA);
  assert.deepEqual(fromLink(`https://course.controlfreak.se/run#c=${value}`), TESTBANA);
  assert.deepEqual(RUN_LEGACY_URL_PREFIXES, [
    "https://run.controlfreak.se/#c=",
    "https://course.controlfreak.se/run#c=",
  ]);
});

// (b) Version 1 alphanumeric payload, course with a fixed order (v0.6.0).
test("frozen: v0.6.0 course with a fixed order", () => {
  const payload = "160P61:1E+4G2LD9MDZ/MLX0HBM160GG4AM0ZU0$PL/DUT8EHY0X+0SG080";
  assert.deepEqual(decodeRunCourse(payload), TESTBANA);
  assert.deepEqual(runCourseFromHash(`#${payload}`), TESTBANA);
  assert.equal(RUN_URL_PREFIX, "https://run.controlfreak.se/#");
  assert.deepEqual(fromLink(`https://run.controlfreak.se/#${payload}`), TESTBANA);
});

// (c) Version 1 alphanumeric payload, score course (v0.6.0).
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

// (d) Earliest legacy layout (Course, 2026-10-17): base64url after `#c=`, version byte 1
// followed by radius, accuracy, order and flags, no start. Read-only (v0.6.2). The stored
// radius (10 m) and accuracy (30 m) are ignored; the runner app's fixed rules apply.
// This code is printed and in circulation.
test("frozen: earliest legacy #c= layout, printed code \"Bana 2\"", () => {
  const value = "AQoeAAEGQmFuYSAyAyacmewFlufNASeDAssDKIICxQGcApgE";
  const course = {
    v: 1,
    name: "Bana 2",
    start: null,
    controls: [
      { code: 38, lat: 61.2923, lng: 16.85963 },
      { code: 39, lat: 61.291, lng: 16.85733 },
      { code: 40, lat: 61.29229, lng: 16.85634 },
    ],
    finish: { lat: 61.29371, lng: 16.85902 },
    score: null,
  };
  assert.deepEqual(decodeLegacyRunCourse(value), course);
  assert.deepEqual(runCourseFromHash(`#c=${value}`), course);
  assert.deepEqual(fromLink(`https://course.controlfreak.se/run#c=${value}`), course);
  assert.deepEqual(fromLink(`https://run.controlfreak.se/#c=${value}`), course);
});

// (e) Earliest legacy layout, written by the encoder of 2026-10-17 (commit d443d7d in
// orienteer-mapper-viewer) for the course of its own tests: radius 20 m, accuracy 30 m,
// non-ASCII name, with and without a finish.
test("frozen: earliest legacy #c= layout, \"Blå 5 km\" with and without finish", () => {
  const controls = [
    { code: 31, lat: 60.60512, lng: 17.06321 },
    { code: 45, lat: 60.60733, lng: 17.06012 },
    { code: 102, lat: 60.6041, lng: 17.0688 },
  ];
  const withFinish = "ARQeAAEJQmzDpSA1IGttAx_A5-MFoqXQAS26A-kEZoUFyA2zAcsN";
  const withoutFinish = "ARQeAAAJQmzDpSA1IGttAx_A5-MFoqXQAS26A-kEZoUFyA0";
  const course = (finish) => ({ v: 1, name: "Blå 5 km", start: null, controls, finish, score: null });
  assert.deepEqual(decodeLegacyRunCourse(withFinish), course({ lat: 60.6032, lng: 17.0601 }));
  assert.deepEqual(fromLink(`https://course.controlfreak.se/run#c=${withFinish}`), course({ lat: 60.6032, lng: 17.0601 }));
  assert.deepEqual(decodeLegacyRunCourse(withoutFinish), course(null));
  assert.deepEqual(fromLink(`https://course.controlfreak.se/run#c=${withoutFinish}`), course(null));
});
