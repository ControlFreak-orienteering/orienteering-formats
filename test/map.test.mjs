// Checks the built map entry point (dist/map) the way the apps load it: as plain ES
// modules, without a bundler. The map reader's own tests are in src/map/*.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";

import { MapError, readMapFile } from "../dist/map/index.js";
import { OcdFileBuilder } from "../dist/map/testing/ocd-builder.js";

test("dist/map reads and draws an OCAD map", () => {
  const file = new OcdFileBuilder(2018)
    .addColor(0, "Black", [0, 0, 0, 100])
    .addScale(10000)
    .addPointSymbol({
      symNum: 101000,
      elements: [{ type: 4, color: 0, diameter: 60, points: [[0, 0]] }],
    })
    .addObject({ sym: 101000, otp: 1, coords: [[100, -200]] })
    .build();
  const drawing = readMapFile(file, "map.ocd");
  assert.equal(drawing.format, "ocad");
  assert.equal(drawing.scale, 10000);
  assert.match(drawing.innerMarkup, /cx="100" cy="200"/);
});

test("dist/map explains a file it does not read", () => {
  assert.throws(
    () => readMapFile(new Uint8Array(4), "map.pdf"),
    (e) => e instanceof MapError && e.code === "unsupported-file",
  );
});
