import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCourseExchange } from "../dist/index.js";
import { sampleExchange } from "./sample.mjs";

test("keeps a well-formed section as it is", () => {
  assert.deepEqual(parseCourseExchange(JSON.parse(JSON.stringify(sampleExchange))), sampleExchange);
});

test("gives null when there is no section", () => {
  assert.equal(parseCourseExchange(undefined), null);
  assert.equal(parseCourseExchange(null), null);
  assert.equal(parseCourseExchange("courses"), null);
  assert.equal(parseCourseExchange([]), null);
});

test("drops entries it cannot use instead of failing", () => {
  const read = parseCourseExchange({
    map: { scale: -1, metersPerUnit: "x", georeference: { easting: 1 } },
    controls: [
      { id: "ok", kind: "control", codes: [31, "32", 1.5], x: 1, y: 2, lat: 200, lng: 1 },
      { id: "ok", kind: "control", codes: [], x: 5, y: 5 },
      { id: "", kind: "control", codes: [], x: 1, y: 2 },
      { id: "nokind", kind: "tower", codes: [], x: 1, y: 2 },
      { id: "nox", kind: "start", codes: [] },
      "junk",
    ],
    courses: [
      {
        id: "1",
        name: 7,
        order: "random",
        controls: ["ok", "missing", 3],
        lengthMeters: -5,
        scores: { ok: 5, missing: 3, bad: "x" },
        variations: [{ code: "A", controls: ["ok"] }, { code: "A", controls: [] }, { controls: [] }],
        futureField: true,
      },
      { name: "no id" },
    ],
    futureSection: {},
  });
  assert.deepEqual(read, {
    controls: [{ id: "ok", kind: "control", codes: [31], x: 1, y: 2 }],
    courses: [
      {
        id: "1",
        name: "",
        order: "fixed",
        controls: ["ok"],
        scores: { ok: 5 },
        variations: [{ code: "A", controls: ["ok"] }],
      },
    ],
  });
});
