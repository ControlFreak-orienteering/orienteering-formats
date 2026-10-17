import assert from "node:assert/strict";
import { test } from "node:test";

import {
  encodeFrames,
  FRAME_PREFIX,
  FrameCollector,
  readStartList,
  START_LIST_FORMAT,
  writeStartList,
} from "../dist/qr.js";

test("a QR film is cut into frames and put together again in any order", async () => {
  const payload = JSON.stringify({
    runners: Array.from({ length: 200 }, (_, i) => ({ name: `Löpare ${i}`, card: 1000 + i })),
  });
  const frames = await encodeFrames(payload, 200);
  assert.ok(frames.length > 1);
  assert.ok(frames.every((f) => f.startsWith(FRAME_PREFIX)));

  const collector = new FrameCollector();
  // The camera sees frames out of order, and some twice.
  for (const frame of [...frames].reverse()) collector.add(frame);
  assert.equal(collector.add(frames[0]), false);
  assert.equal(collector.complete(), true);
  assert.deepEqual(collector.progress(), { received: frames.length, count: frames.length });
  assert.equal(await collector.payload(), payload);
});

test("other QR codes and frames of another film are ignored", async () => {
  const text = (seed) =>
    JSON.stringify(Array.from({ length: 300 }, (_, i) => (i * 7919 + seed) % 100_003));
  const first = await encodeFrames(text(1), 50);
  const second = await encodeFrames(text(2), 50);
  const collector = new FrameCollector();
  assert.equal(collector.add("https://example.com"), false);
  assert.equal(collector.add(first[0]), true);
  assert.equal(collector.add(second[1]), false);
  assert.equal(collector.add(`${FRAME_PREFIX}x|9|3|zz`), false);
  assert.equal(collector.complete(), false);
  await assert.rejects(collector.payload(), { name: "FormatError", code: "unreadable" });
  collector.reset();
  assert.deepEqual(collector.progress(), { received: 0, count: null });
});

const list = {
  createdAt: "2026-10-18T08:42:00.000Z",
  competition: { name: "Vårspringet", date: "2026-10-18" },
  runners: [
    { time: "10:00:00", name: "Anna Ek", club: "OK Ravinen", class: "D21", card: 123456 },
    { time: "10:02:00", name: "Bo Berg", class: "H21", start: "S2", course: "Bana 3", late: true },
  ],
};

test("a start list reads back as it was written", () => {
  const text = writeStartList(list);
  assert.equal(JSON.parse(text).format, START_LIST_FORMAT);
  assert.deepEqual(readStartList(text), list);
});

test("a start list survives a QR film", async () => {
  const collector = new FrameCollector();
  for (const frame of await encodeFrames(writeStartList(list))) collector.add(frame);
  assert.deepEqual(readStartList(await collector.payload()), list);
});

test("a later version still reads: unknown fields are ignored, bad rows left out", () => {
  const later = JSON.stringify({
    format: START_LIST_FORMAT,
    version: 7,
    createdAt: "2026-10-18T08:42:00.000Z",
    competition: { name: "Vårspringet", date: "2026-10-18", venue: "Kantorp" },
    runners: [
      { time: "10:00", name: "Anna Ek", bib: 12 },
      { time: "25:00:00", name: "Fel tid" },
      { time: "10:01:00", name: "" },
      "not a runner",
    ],
  });
  assert.deepEqual(readStartList(later).runners, [{ time: "10:00:00", name: "Anna Ek" }]);
});

test("anything else is not a start list", () => {
  assert.throws(() => readStartList("not json"), { code: "wrong-format" });
  assert.throws(() => readStartList('{"format":"other"}'), { code: "wrong-format" });
  assert.throws(() => readStartList(`{"format":"${START_LIST_FORMAT}"}`), { code: "unreadable" });
});
