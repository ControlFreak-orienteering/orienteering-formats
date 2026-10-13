import assert from "node:assert/strict";
import { test } from "node:test";

import { hasCfpackMagic } from "../dist/index.js";

test("recognises a pack by its first bytes", () => {
  const pack = new TextEncoder().encode("CFPACK\u0001\u0000rest of the file");
  assert.equal(hasCfpackMagic(pack), true);
});

test("rejects other files and too-short input", () => {
  assert.equal(hasCfpackMagic(new TextEncoder().encode("PK\u0003\u0004 a zip file")), false);
  assert.equal(hasCfpackMagic(new TextEncoder().encode("CFP")), false);
});
