import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cfpackFileName,
  createProjectEnvelope,
  FormatError,
  hasCfpackMagic,
  looksLikeCfpack,
  readCfpack,
  writeCfpack,
} from "../dist/index.js";
import { sampleExchange } from "./sample.mjs";

const project = { name: "Skattjakt", mapName: "test.ocd", mapId: "abc", scale: 5000, origin: "p1" };
const work = { data: { controls: [1, 2] } };
const envelope = (over = {}) =>
  createProjectEnvelope({ writtenBy: "Test", project, work, savedAt: 1, ...over });

/** A "map file" gzip actually shrinks. */
const mapBytes = new TextEncoder().encode("<map>".padEnd(50_000, "contour "));
const map = { bytes: mapBytes, name: "test.ocd", id: "abc" };

const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

const codeOf = async (bytes) => {
  try {
    await readCfpack(bytes.slice().buffer);
  } catch (e) {
    assert.ok(e instanceof FormatError);
    return e.code;
  }
  return null;
};

test("recognises a pack by its first bytes", async () => {
  const pack = new TextEncoder().encode("CFPACK\u0001\u0000rest of the file");
  assert.equal(hasCfpackMagic(pack), true);
  assert.equal(await looksLikeCfpack(await writeCfpack(envelope(), null)), true);
});

test("rejects other files and too-short input", async () => {
  assert.equal(hasCfpackMagic(new TextEncoder().encode("PK\u0003\u0004 a zip file")), false);
  assert.equal(hasCfpackMagic(new TextEncoder().encode("CFP")), false);
  assert.equal(await looksLikeCfpack(new Blob(['{"format":"controlfreak-project"}'])), false);
  assert.equal(await looksLikeCfpack(new Blob([])), false);
});

test("gives back the project, the work, the exchange and the map byte for byte", async () => {
  const read = await readCfpack(await bytesOf(await writeCfpack(envelope({ exchange: sampleExchange }), map)));
  assert.deepEqual(read.envelope.project, project);
  assert.deepEqual(read.envelope.work, work);
  assert.deepEqual(read.envelope.exchange, sampleExchange);
  assert.equal(read.map.name, "test.ocd");
  assert.equal(read.map.id, "abc");
  assert.deepEqual(read.map.bytes, mapBytes);
});

test("accepts the map as a Blob and compresses it", async () => {
  const pack = await writeCfpack(envelope(), { ...map, bytes: new Blob([mapBytes]) });
  assert.ok(pack.size < mapBytes.byteLength / 2);
  const read = await readCfpack(await pack.arrayBuffer());
  assert.deepEqual(read.map.bytes, mapBytes);
});

test("can be written without a map and without work", async () => {
  const read = await readCfpack(await bytesOf(await writeCfpack(envelope({ work: null }), null)));
  assert.equal(read.map, null);
  assert.equal(read.envelope.work, null);
  assert.equal(read.envelope.exchange, null);
});

test("reads a raw (uncompressed) map", async () => {
  const header = new TextEncoder().encode(
    JSON.stringify({
      format: "controlfreak-project",
      version: 1,
      project: {},
      map: { name: "m.ocd", id: "x", encoding: "raw", byteLength: 3 },
    }),
  );
  const bytes = new Uint8Array(12 + header.byteLength + 3);
  bytes.set(new TextEncoder().encode("CFPACK"));
  new DataView(bytes.buffer).setUint16(6, 1, true);
  new DataView(bytes.buffer).setUint32(8, header.byteLength, true);
  bytes.set(header, 12);
  bytes.set([7, 8, 9], 12 + header.byteLength);
  const read = await readCfpack(bytes);
  assert.deepEqual([...read.map.bytes], [7, 8, 9]);
});

test("reports what is wrong with a pack", async () => {
  assert.equal(await codeOf(new TextEncoder().encode("this is not a pack at all")), "wrong-format");
  assert.equal(await codeOf(new Uint8Array(4)), "wrong-format");

  const good = await bytesOf(await writeCfpack(envelope(), map));
  const newer = good.slice();
  new DataView(newer.buffer).setUint16(6, 99, true);
  assert.equal(await codeOf(newer), "newer-version");

  assert.equal(await codeOf(good.subarray(0, good.byteLength - 100)), "unreadable");
  assert.equal(await codeOf(good.subarray(0, 40)), "unreadable");

  // The map is not the length the header claims.
  const headerLength = new DataView(good.buffer).getUint32(8, true);
  const text = new TextDecoder().decode(good.subarray(12, 12 + headerLength));
  const patched = new TextEncoder().encode(text.replace(/"byteLength":\d+/, '"byteLength":12'));
  const out = new Uint8Array(12 + patched.byteLength + good.byteLength - 12 - headerLength);
  out.set(good.subarray(0, 12));
  new DataView(out.buffer).setUint32(8, patched.byteLength, true);
  out.set(patched, 12);
  out.set(good.subarray(12 + headerLength), 12 + patched.byteLength);
  assert.equal(await codeOf(out), "unreadable");
});

test("makes a pack file name", () => {
  assert.equal(cfpackFileName("Skattjakt / 2026"), "Skattjakt - 2026.cfpack");
  assert.equal(cfpackFileName("   "), "projekt.cfpack");
});
