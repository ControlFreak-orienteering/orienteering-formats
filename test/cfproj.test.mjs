import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CFPROJ_FILE_EXTENSION,
  createProjectEnvelope,
  FormatError,
  projectFileName,
  readProjectFile,
  writeProjectFile,
} from "../dist/index.js";
import { sampleExchange } from "./sample.mjs";

const project = {
  name: "  KM medel 2026 ",
  mapName: "Siggetorp.ocd",
  mapId: "abc123",
  scale: 7500,
  origin: "p-1",
};
const work = { mapName: "Siggetorp.ocd", savedAt: 1700, data: { anything: [1, 2, 3] } };

const envelope = (over = {}) =>
  createProjectEnvelope({ writtenBy: "Test", project, work, savedAt: 42, ...over });

const codeOf = (fn) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof FormatError);
    return e.code;
  }
  return null;
};

test("round-trips the project and passes work through unread", () => {
  const read = readProjectFile(writeProjectFile(envelope()));
  assert.equal(read.format, "controlfreak-project");
  assert.equal(read.version, 1);
  assert.equal(read.writtenBy, "Test");
  assert.equal(read.savedAt, 42);
  assert.deepEqual(read.project, { ...project, name: "KM medel 2026" });
  assert.deepEqual(read.work, work);
  assert.equal(read.exchange, null);
});

test("is indented text without an exchange field when there is none", () => {
  const text = writeProjectFile(envelope());
  assert.match(text, /\n {2}"format"/);
  assert.doesNotMatch(text, /exchange/);
});

test("round-trips the exchange section", () => {
  const read = readProjectFile(writeProjectFile(envelope({ exchange: sampleExchange })));
  assert.deepEqual(read.exchange, sampleExchange);
});

test("reads missing fields as null", () => {
  const read = readProjectFile('{"format":"controlfreak-project","version":1,"project":{}}');
  assert.deepEqual(read.project, { name: "", mapName: null, mapId: null, scale: null, origin: null });
  assert.equal(read.work, null);
  assert.equal(read.savedAt, 0);
});

test("reports what is wrong with a file", () => {
  assert.equal(codeOf(() => readProjectFile("{not json")), "unreadable");
  assert.equal(codeOf(() => readProjectFile('{"hello":"world"}')), "wrong-format");
  assert.equal(codeOf(() => readProjectFile('{"format":"iof-xml"}')), "wrong-format");
  const newer = writeProjectFile(envelope()).replace('"version": 1', '"version": 99');
  assert.equal(codeOf(() => readProjectFile(newer)), "newer-version");
});

test("makes a file name any file system accepts", () => {
  assert.equal(projectFileName("KM / 2026", CFPROJ_FILE_EXTENSION), "KM - 2026.cfproj");
  assert.equal(projectFileName("   ", CFPROJ_FILE_EXTENSION), "projekt.cfproj");
  assert.doesNotMatch(projectFileName('a/b\\c:d?"e"', ".x"), /[\\/:*?"<>|]/);
});
