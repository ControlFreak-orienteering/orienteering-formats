import assert from "node:assert/strict";
import { test } from "node:test";

import {
  newRunnerId,
  parseRunLiveBody,
  parseRunLiveLink,
  runLiveLink,
  runLiveStandings,
} from "../dist/run-live.js";

const T0 = Date.UTC(2026, 9, 26, 9, 0, 0);
const course = { name: "Bana A", controls: [{ code: 31 }, { code: 32 }, { code: 33 }], score: null };

function body(name, punches, finishAt = null, extra = {}) {
  const { runnerId, secret } = newRunnerId();
  return {
    protocol: "cf-run-live",
    version: 1,
    runnerId,
    secret,
    name,
    course,
    startAt: T0,
    punches: punches.map(([index, s]) => ({ index, at: T0 + s * 1000 })),
    finishAt: finishAt === null ? null : T0 + finishAt * 1000,
    generatedAt: new Date(T0).toISOString(),
    ...extra,
  };
}

test("the runner link round-trips, and only https addresses are taken", () => {
  const link = runLiveLink({ base: "https://live.controlfreak.se/api/public/cf-run/abc", key: "k1" });
  assert.ok(link.startsWith("https://run.controlfreak.se/live#"));
  assert.deepEqual(parseRunLiveLink(new URL(link).hash), {
    base: "https://live.controlfreak.se/api/public/cf-run/abc",
    key: "k1",
  });
  assert.equal(parseRunLiveLink("#b=http%3A%2F%2Fx.se&k=k1"), null);
  assert.equal(parseRunLiveLink("#b=https%3A%2F%2Fx.se"), null);
  assert.equal(parseRunLiveLink("#xyz"), null);
});

test("an upload is checked and cleaned", () => {
  const b = body("  Anna Berg ", [[0, 300]]);
  const parsed = parseRunLiveBody({ ...b, track: [1, 2, 3] });
  assert.equal(parsed.name, "Anna Berg");
  assert.equal("track" in parsed, false);
  assert.equal(parseRunLiveBody({ ...b, protocol: "cf-live" }), null);
  assert.equal(parseRunLiveBody({ ...b, version: 2 }), null);
  assert.equal(parseRunLiveBody({ ...b, name: "" }), null);
  assert.equal(parseRunLiveBody({ ...b, name: "x".repeat(61) }), null);
  assert.equal(parseRunLiveBody({ ...b, secret: "short" }), null);
  assert.equal(parseRunLiveBody({ ...b, punches: [{ index: 3, at: T0 }] }), null);
  assert.equal(parseRunLiveBody({ ...b, finishAt: "soon" }), null);
});

test("standings: finished first by time, then those out by progress, then incomplete", () => {
  const [a] = runLiveStandings([
    body("Out early", [[0, 200]]),
    body("Slow", [[0, 300], [1, 600], [2, 900]], 1000),
    body("Missed one", [[0, 100], [2, 400]], 500),
    body("Fast", [[0, 250], [1, 500], [2, 700]], 800),
    body("Out far", [[0, 280], [1, 560]]),
  ]);
  assert.deepEqual(
    a.rows.map((r) => [r.name, r.place]),
    [["Fast", 1], ["Slow", 2], ["Out far", null], ["Out early", null], ["Missed one", null]],
  );
  assert.deepEqual(a.rows[0].splits, [250_000, 500_000, 700_000]);
  assert.equal(a.rows[0].time, 800_000);
});

test("standings on a score course count points less the penalty", () => {
  const score = {
    name: "Poäng",
    controls: [{ code: 31, points: 10 }, { code: 32, points: 20 }],
    score: { timeLimitMinutes: 10, penaltyPerMinute: 3 },
  };
  const [c] = runLiveStandings([
    body("Late", [[0, 60], [1, 120], [1, 130]], 10 * 60 + 61, { course: score }),
    body("In time", [[1, 100]], 500, { course: score }),
  ]);
  assert.deepEqual(
    c.rows.map((r) => [r.name, r.points, r.place]),
    [["Late", 24, 1], ["In time", 20, 2]],
  );
});
