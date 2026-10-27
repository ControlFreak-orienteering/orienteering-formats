import assert from "node:assert/strict";
import { test } from "node:test";

import {
  newRunnerId,
  parseRunLiveBody,
  parseRunLiveLink,
  RUN_LIVE_OPEN_PATH,
  runLiveLink,
  runLiveOpenBase,
  runLiveRunnerUrl,
  runLiveStandings,
} from "../dist/run-live.js";
import { readFileSync } from "node:fs";

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

test("standings take the punches in course order, as Run and MeOS do", () => {
  // As on Gul 3 at Virtuell Mo-natt 2026-10-27: code 37 is control 2 and control 4, and the
  // phone punches both places at once; control 5 is passed early, on the way to control 2.
  const twice = {
    name: "Gul",
    controls: [{ code: 48 }, { code: 37 }, { code: 38 }, { code: 37 }, { code: 34 }],
    score: null,
  };
  const [c] = runLiveStandings([
    body("Out", [[0, 300], [4, 500], [1, 900], [3, 900], [2, 1200]], null, { course: twice }),
    body("Done", [[0, 280], [1, 700], [3, 700], [2, 1000], [3, 1300], [1, 1300], [4, 1500]], 1600, {
      course: twice,
    }),
  ]);
  const out = c.rows.find((r) => r.name === "Out");
  // Control 4 (the second 37) is not taken yet, and control 5 not before control 4.
  assert.deepEqual(out.splits, [300_000, 900_000, 1_200_000, null, null]);
  assert.equal(out.taken, 3);
  const done = c.rows.find((r) => r.name === "Done");
  assert.deepEqual(done.splits, [280_000, 700_000, 1_000_000, 1_300_000, 1_500_000]);
  assert.equal(done.complete, true);
  assert.equal(done.place, 1);
});

test("a run with a control taken only out of order is not complete", () => {
  const [c] = runLiveStandings([body("Early", [[0, 100], [2, 200], [1, 300]], 400)]);
  assert.deepEqual(c.rows[0].splits, [100_000, 300_000, null]);
  assert.equal(c.rows[0].complete, false);
  assert.equal(c.rows[0].place, null);
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

test("the open address is built from the site's origin", () => {
  assert.equal(RUN_LIVE_OPEN_PATH, "/api/public/cf-run/open");
  assert.equal(runLiveOpenBase("https://live.controlfreak.se"), "https://live.controlfreak.se/api/public/cf-run/open");
  assert.equal(runLiveOpenBase("https://live.controlfreak.se/some/page?x=1"), "https://live.controlfreak.se/api/public/cf-run/open");
  assert.equal(
    runLiveRunnerUrl(runLiveOpenBase("http://localhost:8080/"), "ab12"),
    "http://localhost:8080/api/public/cf-run/open/runners/ab12",
  );
  assert.equal(runLiveRunnerUrl("https://x.se/api/public/cf-run/abc/", "ab12"), "https://x.se/api/public/cf-run/abc/runners/ab12");
  assert.throws(() => runLiveOpenBase("not a url"), TypeError);
});

test("an upload keeps courseLink within the limits, drops it otherwise, and ignores a track", () => {
  const b = body("Anna", [[0, 300]]);
  const parsed = parseRunLiveBody({ ...b, courseLink: "#0100ABC$*+-./:", track: { polyline: "_p~iF~ps|U", times: "??" } });
  assert.equal(parsed.courseLink, "0100ABC$*+-./:", "kept without #");
  assert.equal("track" in parsed, false, "unknown fields are dropped");
  assert.equal(parsed.version, 1);

  // A body of the first release, without the new field, is as valid as before.
  const plain = parseRunLiveBody(b);
  assert.equal("courseLink" in plain, false);

  const dropped = (courseLink) => {
    const p = parseRunLiveBody({ ...b, courseLink });
    assert.notEqual(p, null, "the run itself is kept");
    return !("courseLink" in p);
  };
  assert.ok(dropped(""));
  assert.ok(dropped("#"));
  assert.ok(dropped("lower case"));
  assert.ok(dropped(42));
  assert.ok(dropped("A".repeat(16_001)));
  assert.equal(parseRunLiveBody({ ...b, courseLink: "A".repeat(16_000) }).courseLink.length, 16_000);
});

test("run-live imports nothing", () => {
  const js = readFileSync(new URL("../dist/run-live.js", import.meta.url), "utf8");
  assert.equal(/^\s*import\b|\bimport\(/m.test(js), false);
});

test("an upload keeps a club within the limit and drops it otherwise; standings show it", () => {
  const b = body("Anna", [[0, 300]]);
  assert.equal(parseRunLiveBody({ ...b, club: "  Söderhamns OK " }).club, "Söderhamns OK");
  assert.equal(parseRunLiveBody({ ...b, club: "x".repeat(60) }).club.length, 60);
  for (const club of ["", "   ", "x".repeat(61), 42, null]) {
    const p = parseRunLiveBody({ ...b, club });
    assert.notEqual(p, null, "the run itself is kept");
    assert.equal("club" in p, false);
  }
  assert.equal("club" in parseRunLiveBody(b), false);
  const [c] = runLiveStandings([parseRunLiveBody({ ...b, club: "SOK" }), parseRunLiveBody(body("Bo", []))]);
  assert.deepEqual(
    c.rows.map((r) => [r.name, r.club]),
    [["Anna", "SOK"], ["Bo", null]],
  );
});
