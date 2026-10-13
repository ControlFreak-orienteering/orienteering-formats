import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readCfpack, readProjectFile } from "../dist/index.js";

/** Files written before this package existed, see fixtures/README.md. */
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

const expectedProject = {
  name: "Fixtur före orienteering-formats",
  mapName: "Fixturkarta.ocd",
  mapId: "fixture-map",
  scale: 10000,
  origin: "desk-1",
};

test("reads a .cfproj written by ControlFreak before v0.2.0", () => {
  const read = readProjectFile(fixture("fixtur-v1.cfproj").toString("utf8"));
  assert.equal(read.version, 1);
  assert.equal(read.writtenBy, "ControlFreak");
  assert.deepEqual(read.project, expectedProject);
  assert.equal(read.work.data.courses.length, 2);
  assert.equal(read.exchange, null);
});

test("reads a .cfpack written by ControlFreak before v0.2.0", async () => {
  const read = await readCfpack(new Uint8Array(fixture("fixtur-v1.cfpack")));
  assert.deepEqual(read.envelope.project, expectedProject);
  assert.equal(read.envelope.work.data.controls.length, 5);
  assert.equal(read.envelope.exchange, null);
  assert.equal(read.map.name, "Fixturkarta.ocd");
  assert.equal(read.map.id, "fixture-map");
  assert.deepEqual(read.map.bytes, new Uint8Array(fixture("fixtur-v1.map.ocd")));
});
