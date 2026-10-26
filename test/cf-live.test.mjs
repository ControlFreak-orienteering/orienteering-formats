import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import {
  agree,
  applyUpload,
  CF_LIVE_PROMPT_VERSION,
  CF_LIVE_VERSIONS,
  deltaBetween,
  infoAnswer,
  parseInfo,
} from "../dist/cf-live.js";

const fixtures = new URL("./fixtures/cf-live/", import.meta.url);
const infoFixtures = readdirSync(fixtures)
  .filter((name) => name.startsWith("info-"))
  .map((name) => [name, JSON.parse(readFileSync(new URL(name, fixtures), "utf8"))]);

const competition = {
  id: "c1",
  name: "Vårspringet",
  date: "2026-04-18",
  organiser: "OK Ravinen",
  timeZone: "Europe/Stockholm",
};
const cls = (id, order, extra = {}) => ({
  id,
  name: id.toUpperCase(),
  order,
  course: null,
  radioControls: [],
  results: [],
  ...extra,
});
const full = (sequence, classes) => ({
  protocol: "cf-live",
  version: 1,
  kind: "full",
  sequence,
  generatedAt: "2026-04-18T11:05:30+02:00",
  competition,
  classes,
});

test("every site ever built can still be agreed with, whatever the organiser chose", () => {
  assert.ok(infoFixtures.length >= 5);
  for (const [name, json] of infoFixtures) {
    const info = parseInfo(json);
    assert.ok(info, name);
    for (const wanted of [
      { mode: "full", gzip: false },
      { mode: "delta", gzip: true },
    ]) {
      const agreed = agree(info, wanted);
      assert.equal(agreed.ok, true, name);
      assert.ok(CF_LIVE_VERSIONS.includes(agreed.version), name);
      // Never more than the site said it takes.
      assert.ok(info.modes.includes(agreed.mode), name);
      assert.ok(info.encodings.includes(agreed.encoding), name);
    }
  }
});

test("a site without prompt in info was built from prompt 1", () => {
  const info = parseInfo(
    JSON.parse(readFileSync(new URL("info-prompt1-full.json", fixtures), "utf8")),
  );
  assert.equal(info.prompt, 1);
  assert.equal(agree(info, { mode: "full", gzip: false }).olderPrompt, true);
});

test("a site answering the current infoAnswer is up to date", () => {
  const info = parseInfo(infoAnswer({ delta: true, gzip: true }));
  assert.equal(info.prompt, CF_LIVE_PROMPT_VERSION);
  const agreed = agree(info, { mode: "delta", gzip: true });
  assert.deepEqual(
    { mode: agreed.mode, encoding: agreed.encoding, olderPrompt: agreed.olderPrompt },
    { mode: "delta", encoding: "gzip", olderPrompt: false },
  );
});

test("the wanted mode falls back to full when the site does not take it", () => {
  const info = parseInfo({ protocol: "cf-live", versions: [1], modes: ["full"] });
  const agreed = agree(info, { mode: "delta", gzip: true });
  assert.equal(agreed.mode, "full");
  assert.equal(agreed.encoding, "identity");
  assert.deepEqual(agreed.notSupported, ["delta", "gzip"]);
});

test("the highest common version is chosen, and none in common is refused", () => {
  const info = parseInfo({ protocol: "cf-live", versions: [1, 2, 3] });
  assert.equal(agree(info, { mode: "full", gzip: false }, [1, 2]).version, 2);
  const none = agree(parseInfo({ protocol: "cf-live", versions: [7] }), {
    mode: "full",
    gzip: false,
  });
  assert.deepEqual(none, { ok: false, reason: "no-common-version", theirs: [7], ours: [1] });
});

test("info from another protocol is not read", () => {
  assert.equal(parseInfo({ protocol: "other", versions: [1] }), null);
  assert.equal(parseInfo({ protocol: "cf-live" }), null);
  assert.equal(parseInfo("cf-live"), null);
});

test("a delta holds only changed and removed classes", () => {
  const a = full(1, [cls("h21", 0), cls("d21", 1), cls("h10", 2)]);
  const b = full(2, [cls("h21", 0, { results: [{ runnerId: "r1" }] }), cls("d21", 1), cls("d10", 3)]);
  const delta = deltaBetween(a, b, 2);
  assert.equal(delta.kind, "delta");
  assert.equal(delta.baseSequence, 1);
  assert.deepEqual(
    delta.classes.map((c) => c.id),
    ["h21", "d10"],
  );
  assert.deepEqual(delta.removedClassIds, ["h10"]);
  assert.equal(deltaBetween(a, { ...a, sequence: 5 }, 5), null);
});

test("a site applies full and delta uploads, and asks for a full one when it must", () => {
  let stored = null;
  const lookup = () => stored;
  const first = full(1, [cls("h21", 0), cls("d21", 1), cls("h10", 2)]);
  let out = applyUpload(first, lookup);
  assert.equal(out.status, 204);
  stored = out.store;

  const next = full(2, [cls("h21", 0, { results: [{ runnerId: "r1" }] }), cls("d21", 1), cls("d10", 3)]);
  out = applyUpload(deltaBetween(first, next, 2), lookup);
  assert.equal(out.status, 204);
  stored = out.store;
  assert.deepEqual(stored.data.classes, next.classes);
  assert.equal(stored.lastSequence, 2);

  // A lost upload: the base is not what the site holds.
  const stale = { ...deltaBetween(first, next, 3), baseSequence: 1 };
  assert.deepEqual(applyUpload(stale, lookup), { status: 409, body: { needFull: true } });
  // Nothing stored (e.g. after a reset).
  assert.equal(applyUpload(deltaBetween(first, next, 2), () => null).status, 409);
});

test("tests are answered and never stored; bad bodies are refused", () => {
  const testBody = { ...full(0, []), kind: "test" };
  assert.deepEqual(applyUpload(testBody, () => null), {
    status: 204,
    competitionId: null,
    store: null,
  });
  assert.equal(applyUpload({ ...testBody, protocol: "x" }, () => null).status, 400);
  assert.equal(applyUpload({ ...testBody, kind: "other" }, () => null).status, 400);
  assert.equal(applyUpload([], () => null).status, 400);
});

test("fields a newer app adds are kept, so they reach the page", () => {
  const body = { ...full(1, [cls("h21", 0, { future: 1 })]), future: { x: 1 } };
  const out = applyUpload(body, () => null);
  assert.equal(out.store.data.future.x, 1);
  assert.equal(out.store.data.classes[0].future, 1);
});
