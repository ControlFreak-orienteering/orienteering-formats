import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LIVE_COMPETITION_CODE_ALPHABET,
  LIVE_COMPETITION_CODE_LENGTH,
  LIVE_COMPETITION_COURSES_MAX,
  LIVE_COMPETITION_NAME_MAX,
  LIVE_COMPETITION_PATH,
  LIVE_COMPETITION_VERSION,
  LIVE_LINK_PATH,
  liveCompetitionEndpoint,
  liveCompetitionHeaders,
  liveLinkMessage,
  liveLinkUrl,
  parseLiveCompetitionKey,
  parseLiveLinkMessage,
  liveCompetitionRequest,
  normaliseLiveCompetitionCode,
  parseLiveCompetitionRequest,
  parseLiveCompetitionConflict,
  parseLiveCompetitionResponse,
} from "../dist/live-competition.js";

test("constants", () => {
  assert.equal(LIVE_COMPETITION_VERSION, 1);
  assert.equal(LIVE_COMPETITION_PATH, "/api/public/cf-competition");
  assert.equal(LIVE_COMPETITION_NAME_MAX, 120);
  assert.equal(LIVE_COMPETITION_COURSES_MAX, 100);
  assert.equal(LIVE_COMPETITION_CODE_ALPHABET, "ABCDEFGHJKMNPQRSTUVWXYZ23456789");
  assert.equal(LIVE_COMPETITION_CODE_LENGTH, 4);
});

test("request: trims, strips up to the first #, dedupes", () => {
  assert.deepEqual(
    liveCompetitionRequest("  Klubbmästerskap ", ["abc", "https://run.controlfreak.se/#def", "abc"]),
    { v: 1, name: "Klubbmästerskap", courses: ["abc", "def"] },
  );
  assert.deepEqual(liveCompetitionRequest("T", ["  a ", "", "#", "x#a#b", "a"]), {
    v: 1,
    name: "T",
    courses: ["a", "a#b"],
  });
});

test("request: limits", () => {
  assert.equal(liveCompetitionRequest("", ["a"]), null);
  assert.equal(liveCompetitionRequest("   ", ["a"]), null);
  assert.equal(liveCompetitionRequest("T", []), null);
  assert.equal(liveCompetitionRequest("T", ["", "#"]), null);
  assert.equal(liveCompetitionRequest("x".repeat(121), ["a"]).name.length, 120);
  const many = (n) => Array.from({ length: n }, (_, i) => `c${i}`);
  assert.equal(liveCompetitionRequest("T", many(101)), null);
  assert.equal(liveCompetitionRequest("T", many(100)).courses.length, 100);
  assert.equal(liveCompetitionRequest("T", [...many(100), "c0"]).courses.length, 100);
});

test("parse request", () => {
  const r = liveCompetitionRequest("  Klubbmästerskap ", ["abc", "https://run.controlfreak.se/#def", "abc"]);
  assert.deepEqual(parseLiveCompetitionRequest(JSON.parse(JSON.stringify(r))), r);
  assert.equal(parseLiveCompetitionRequest({ ...r, v: 2 }), null);
  assert.equal(parseLiveCompetitionRequest({ ...r, courses: ["a", 1] }), null);
  assert.equal(parseLiveCompetitionRequest({ ...r, name: "" }), null);
  assert.equal(parseLiveCompetitionRequest({ ...r, name: " " }), null);
  assert.equal(parseLiveCompetitionRequest({ ...r, courses: "a" }), null);
  assert.equal(parseLiveCompetitionRequest(null), null);
  assert.equal(parseLiveCompetitionRequest("x"), null);
  assert.equal(parseLiveCompetitionRequest([]), null);
  assert.equal(parseLiveCompetitionRequest({ ...r, courses: [] }), null);
  assert.equal(parseLiveCompetitionRequest({ ...r, courses: Array.from({ length: 101 }, (_, i) => `c${i}`) }), null);
  assert.equal(parseLiveCompetitionRequest({ ...r, name: "x".repeat(130) }).name.length, 120);
  assert.deepEqual(parseLiveCompetitionRequest({ v: 1, name: " N ", courses: ["h#a", "a", " "] }), {
    v: 1,
    name: "N",
    courses: ["a"],
  });
  assert.deepEqual(parseLiveCompetitionRequest({ ...r, extra: 1 }), r);
});

test("parse response", () => {
  const ok = {
    id: "abcd1234",
    url: "https://live.controlfreak.se/t/abcd1234",
    code: "K7QX",
    outcome: "created",
    taken: [],
  };
  assert.deepEqual(parseLiveCompetitionResponse(ok), ok);
  const withTaken = { ...ok, outcome: "added", taken: [{ course: "Bana A", competition: "Annan" }] };
  assert.deepEqual(parseLiveCompetitionResponse(withTaken), withTaken);
  assert.equal(parseLiveCompetitionResponse({ ...ok, outcome: "gone" }), null);
  assert.equal(parseLiveCompetitionResponse({ ...ok, code: "K0QX" }), null);
  assert.equal(parseLiveCompetitionResponse({ ...ok, code: null }), null);
  const { code: _, ...owned } = ok;
  assert.deepEqual(parseLiveCompetitionResponse(owned), owned);
  const flagged = { ...owned, owned: false };
  assert.deepEqual(parseLiveCompetitionResponse(flagged), flagged);
  assert.deepEqual(parseLiveCompetitionResponse({ ...owned, owned: true }), { ...owned, owned: true });
  assert.equal(parseLiveCompetitionResponse({ ...owned, owned: "yes" }), null);
  assert.equal(parseLiveCompetitionResponse({ ...ok, id: "" }), null);
  assert.equal(parseLiveCompetitionResponse({ ...ok, url: 5 }), null);
  assert.equal(parseLiveCompetitionResponse({ ...ok, taken: [{ course: "a" }] }), null);
  assert.equal(parseLiveCompetitionResponse({ ...ok, taken: "x" }), null);
  assert.equal(parseLiveCompetitionResponse(null), null);
});

test("parse conflict", () => {
  const taken = [{ course: "Bana A", competition: "Höstträning", owned: true }];
  assert.deepEqual(parseLiveCompetitionConflict({ error: "all courses taken", taken }), {
    error: "all courses taken",
    taken,
  });
  assert.deepEqual(parseLiveCompetitionConflict({ error: "owner changed" }), { error: "owner changed", taken: [] });
  assert.deepEqual(parseLiveCompetitionConflict({ error: "all courses taken", taken: [{ course: 1 }] }), {
    error: "all courses taken",
    taken: [],
  });
  assert.equal(parseLiveCompetitionConflict({ error: "" }), null);
  assert.equal(parseLiveCompetitionConflict(null), null);
  const withOwned = { id: "abcd1234", url: "u", outcome: "added", taken };
  assert.deepEqual(parseLiveCompetitionResponse(withOwned), withOwned);
  assert.equal(parseLiveCompetitionResponse({ ...withOwned, taken: [{ ...taken[0], owned: 1 }] }), null);
});

test("code", () => {
  assert.equal(normaliseLiveCompetitionCode(" k7qx "), "K7QX");
  for (const bad of ["K7Q", "K7QI", "K7QO", "K7QXX", "K0QX", "K1QX", "K7QL", ""]) {
    assert.equal(normaliseLiveCompetitionCode(bad), null, bad);
  }
});

test("endpoint", () => {
  assert.equal(
    liveCompetitionEndpoint("https://live.controlfreak.se/x"),
    "https://live.controlfreak.se/api/public/cf-competition",
  );
  assert.equal(liveCompetitionEndpoint("http://localhost:8080"), "http://localhost:8080/api/public/cf-competition");
  assert.throws(() => liveCompetitionEndpoint("not a url"));
});

const KEY = "A".repeat(43);
const KEY2 = "abcDEF-_09".repeat(4) + "xyz";

test("link url", () => {
  assert.equal(LIVE_LINK_PATH, "/koppla");
  assert.equal(
    liveLinkUrl("https://live.controlfreak.se/x", "run", "https://run.controlfreak.se"),
    "https://live.controlfreak.se/koppla?app=run&origin=https%3A%2F%2Frun.controlfreak.se",
  );
  assert.equal(
    liveLinkUrl("http://localhost:8080", "course", "http://localhost:5173"),
    "http://localhost:8080/koppla?app=course&origin=http%3A%2F%2Flocalhost%3A5173",
  );
  assert.throws(() => liveLinkUrl("not a url", "run", "https://run.controlfreak.se"));
});

test("link message: build and read", () => {
  const m = liveLinkMessage("run", KEY, "a@b.se");
  assert.deepEqual(m, { type: "cf-live-link", v: 1, app: "run", key: KEY, account: "a@b.se" });
  assert.deepEqual(parseLiveLinkMessage(m), m);
  assert.deepEqual(parseLiveLinkMessage({ ...liveLinkMessage("course", KEY2, "x".repeat(254)) }).app, "course");
});

test("link message: rejections", () => {
  const ok = liveLinkMessage("run", KEY, "a@b.se");
  const bad = [
    null, undefined, "x", 1, [], {},
    { ...ok, type: "other" },
    { ...ok, v: 2 },
    { ...ok, app: "live" },
    { ...ok, key: KEY.slice(1) },
    { ...ok, key: KEY + "A" },
    { ...ok, key: "+".repeat(43) },
    { ...ok, key: 5 },
    { ...ok, account: "" },
    { ...ok, account: "x".repeat(255) },
    { ...ok, account: 5 },
  ];
  for (const b of bad) assert.equal(parseLiveLinkMessage(b), null, JSON.stringify(b));
});

test("headers", () => {
  assert.deepEqual(liveCompetitionHeaders(null), { "Content-Type": "application/json" });
  assert.deepEqual(liveCompetitionHeaders(KEY), {
    "Content-Type": "application/json",
    Authorization: "Bearer " + KEY,
  });
});

test("key from authorization", () => {
  assert.equal(parseLiveCompetitionKey("Bearer " + KEY), KEY);
  for (const bad of [null, "", "Bearer", "Bearer ", "bearer " + KEY, "Basic " + KEY, "Bearer " + KEY.slice(1), "Bearer " + KEY + "A", "Bearer " + KEY + " "]) {
    assert.equal(parseLiveCompetitionKey(bad), null, String(bad));
  }
});

test("request: publish is set only when given and survives the parser", () => {
  const base = liveCompetitionRequest("T", ["a"]);
  assert.equal("publish" in base, false);
  assert.equal(liveCompetitionRequest("T", ["a"], undefined).publish, undefined);
  assert.equal("publish" in liveCompetitionRequest("T", ["a"], undefined), false);
  const on = liveCompetitionRequest("T", ["a"], true);
  const off = liveCompetitionRequest("T", ["a"], false);
  assert.deepEqual(on, { v: 1, name: "T", courses: ["a"], publish: true });
  assert.equal(off.publish, false);
  assert.deepEqual(parseLiveCompetitionRequest(JSON.parse(JSON.stringify(on))), on);
  assert.deepEqual(parseLiveCompetitionRequest(JSON.parse(JSON.stringify(off))), off);
  assert.deepEqual(parseLiveCompetitionRequest(base), base);
  assert.equal(parseLiveCompetitionRequest({ ...base, publish: "yes" }), null);
  assert.equal(parseLiveCompetitionRequest({ ...base, publish: 1 }), null);
  assert.equal(parseLiveCompetitionRequest({ ...base, publish: null }), null);
});

test("response: published is a boolean or missing", () => {
  const ok = { id: "i", url: "https://x/y", outcome: "created", taken: [] };
  assert.equal("published" in parseLiveCompetitionResponse(ok), false);
  assert.equal(parseLiveCompetitionResponse({ ...ok, published: true }).published, true);
  assert.equal(parseLiveCompetitionResponse({ ...ok, published: false }).published, false);
  assert.equal(parseLiveCompetitionResponse({ ...ok, published: "yes" }), null);
  assert.equal(parseLiveCompetitionResponse({ ...ok, published: 1 }), null);
  assert.equal(parseLiveCompetitionResponse({ ...ok, published: null }), null);
});

test("request: organiser and date are set only when usable and survive the parser", () => {
  const base = liveCompetitionRequest("T", ["a"]);
  assert.equal("organiser" in base, false);
  assert.equal("date" in base, false);
  const full = liveCompetitionRequest("T", ["a"], true, { organiser: "  Söderhamns OK ", date: "2026-10-29" });
  assert.deepEqual(full, { v: 1, name: "T", courses: ["a"], publish: true, organiser: "Söderhamns OK", date: "2026-10-29" });
  assert.deepEqual(parseLiveCompetitionRequest(JSON.parse(JSON.stringify(full))), full);
  assert.equal(liveCompetitionRequest("T", ["a"], undefined, { organiser: "x".repeat(200) }).organiser.length, 120);
  assert.equal("organiser" in liveCompetitionRequest("T", ["a"], undefined, { organiser: "  " }), false);
  for (const date of ["2026-02-30", "2026-13-01", "29/10", "2026-1-5", ""]) {
    assert.equal("date" in liveCompetitionRequest("T", ["a"], undefined, { date }), false, date);
  }
  // Ett oanvändbart fält släpps; begäran godtas ändå.
  assert.deepEqual(parseLiveCompetitionRequest({ ...base, organiser: 5, date: "igår" }), base);
});
