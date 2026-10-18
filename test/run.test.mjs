import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decodeLegacyRunCourse,
  decodeRunCourse,
  encodeRunCourse,
  FormatError,
  RUN_PAYLOAD_ALPHABET,
  RUN_URL_PREFIX,
  runCourseFromHash,
  runCourseQrSegments,
  runCourseUrl,
} from "../dist/run/index.js";

const course = (over = {}) => ({
  v: 1,
  name: "Blå 5 km",
  start: { lat: 60.6029, lng: 17.0598 },
  controls: [
    { code: 31, lat: 60.60512, lng: 17.06321 },
    { code: 45, lat: 60.60733, lng: 17.06012 },
    { code: 102, lat: 60.6041, lng: 17.0688 },
  ],
  finish: { lat: 60.6032, lng: 17.0601 },
  score: null,
  ...over,
});

const codeOf = (fn) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof FormatError);
    return e.code;
  }
  return null;
};

/** The payload encoding, written out again here so that tests can build any bytes. */
const toPayload = (bytes) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 2) {
    const odd = i + 1 >= bytes.length;
    let n = odd ? bytes[i] : bytes[i] * 256 + bytes[i + 1];
    for (let k = 0; k < (odd ? 2 : 3); k++) {
      out += RUN_PAYLOAD_ALPHABET[n % 43];
      n = Math.floor(n / 43);
    }
  }
  return out;
};

const fromPayload = (s) => {
  const out = [];
  for (let i = 0; i < s.length; i += 3) {
    const g = [...s.slice(i, i + 3)].map((ch) => RUN_PAYLOAD_ALPHABET.indexOf(ch));
    const n = g.reduceRight((acc, v) => acc * 43 + v, 0);
    if (g.length === 3) out.push(n >> 8, n & 0xff);
    else out.push(n);
  }
  return out;
};

const close = (a, b) => assert.ok(Math.abs(a - b) < 0.6e-5, `${a} != ${b}`);

test("round-trips a course", () => {
  const c = course();
  const back = decodeRunCourse(encodeRunCourse(c));
  assert.equal(back.v, 1);
  assert.equal(back.name, "Blå 5 km");
  assert.equal(back.score, null);
  close(back.start.lat, 60.6029);
  close(back.start.lng, 17.0598);
  assert.deepEqual(
    back.controls.map((x) => x.code),
    [31, 45, 102],
  );
  back.controls.forEach((x, i) => {
    close(x.lat, c.controls[i].lat);
    close(x.lng, c.controls[i].lng);
    assert.equal("points" in x, false);
  });
  close(back.finish.lat, 60.6032);
  close(back.finish.lng, 17.0601);
});

test("round-trips without start or finish, and with no controls", () => {
  const empty = decodeRunCourse(encodeRunCourse(course({ finish: null, controls: [] })));
  assert.equal(empty.finish, null);
  assert.deepEqual(empty.controls, []);
  const noStart = decodeRunCourse(encodeRunCourse(course({ start: null })));
  assert.equal(noStart.start, null);
  close(noStart.finish.lat, 60.6032);
  const neither = decodeRunCourse(encodeRunCourse(course({ start: null, finish: null })));
  assert.equal(neither.start, null);
  assert.equal(neither.finish, null);
});

test("round-trips negative coordinates, and a name with åäö and emoji", () => {
  const name = "Åre ÄÖ åäö 🧭 bana";
  const back = decodeRunCourse(
    encodeRunCourse(course({ name, controls: [{ code: 7, lat: -33.86, lng: -151.21 }] })),
  );
  assert.equal(back.name, name);
  close(back.controls[0].lat, -33.86);
  close(back.controls[0].lng, -151.21);
});

test("round-trips a score course with points, time limit and penalty", () => {
  const score = { timeLimitMinutes: 60, penaltyPerMinute: 10 };
  const c = course({
    controls: [
      { code: 31, points: 10, lat: 60.60512, lng: 17.06321 },
      { code: 45, points: 200, lat: 60.60733, lng: 17.06012 },
      { code: 102, lat: 60.6041, lng: 17.0688 },
    ],
    score,
  });
  const back = decodeRunCourse(encodeRunCourse(c));
  assert.deepEqual(back.score, score);
  // A control without points on a score course is written as 0.
  assert.deepEqual(
    back.controls.map((x) => x.points),
    [10, 200, 0],
  );
  // Points are dropped on a course with a fixed order.
  const fixed = decodeRunCourse(encodeRunCourse({ ...c, score: null }));
  assert.equal(fixed.score, null);
  assert.equal(
    fixed.controls.some((x) => "points" in x),
    false,
  );
});

// Shared test vectors: the apps that write and read the links (ControlFreak and the
// runner app) have the same vectors. Change them only together, in the same release.
test("matches the shared test vector byte for byte", () => {
  const vector = {
    v: 1,
    name: "Testbana",
    start: { lat: 61.3, lng: 17.06 },
    controls: [
      { code: 31, lat: 61.3021, lng: 17.0635 },
      { code: 45, lat: 61.3048, lng: 17.0592 },
      { code: 102, lat: 61.3015, lng: 17.055 },
    ],
    finish: { lat: 61.3002, lng: 17.0605 },
    score: null,
  };
  const payload = "160P61:1E+4G2LD9MDZ/MLX0HBM160GG4AM0ZU0$PL/DUT8EHY0X+0SG080";
  assert.equal(encodeRunCourse(vector), payload);
  assert.deepEqual(decodeRunCourse(payload), vector);
  assert.equal(runCourseUrl(vector), `https://run.controlfreak.se/#${payload}`);
});

test("matches the shared score course test vector byte for byte", () => {
  const vector = {
    v: 1,
    name: "Poängbana",
    start: { lat: 61.3, lng: 17.06 },
    controls: [
      { code: 31, points: 20, lat: 61.3021, lng: 17.0635 },
      { code: 45, points: 30, lat: 61.3048, lng: 17.0592 },
      { code: 102, points: 50, lat: 61.3015, lng: 17.055 },
    ],
    finish: { lat: 61.3002, lng: 17.0605 },
    score: { timeLimitMinutes: 45, penaltyPerMinute: 5 },
  };
  const payload = "560HI1GKF.WMLDE2LDNJDLX0Z/MLX0HBM1601D4JUMG1QQA6$PL/DUI6ECFK+NR/5IUAS";
  assert.equal(encodeRunCourse(vector), payload);
  assert.deepEqual(decodeRunCourse(payload), vector);
});

test("writes only the 43 payload characters, three per two bytes", () => {
  assert.equal(RUN_PAYLOAD_ALPHABET.length, 43);
  assert.equal(new Set(RUN_PAYLOAD_ALPHABET).size, 43);
  // Every character is in the QR alphanumeric mode and needs no escaping in a fragment.
  assert.match(RUN_PAYLOAD_ALPHABET, /^[0-9A-Z$*+\-./:]+$/);
  const payload = encodeRunCourse(course());
  assert.match(payload, /^[0-9A-Z$*+\-./:]+$/);
  assert.deepEqual(toPayload(fromPayload(payload)), payload);
  // Edge values of the packing.
  assert.equal(toPayload([0xff, 0xff]), "3JZ");
  assert.equal(toPayload([0xff]), ".5");
  assert.equal(toPayload([0, 0, 0]), "00000");
});

test("fits 25 controls over 3×3 km in a short payload", () => {
  // Pseudo-random but repeatable spread over 3×3 km (about 0.027° lat, 0.054° lng).
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const controls = Array.from({ length: 25 }, (_, i) => ({
    code: 31 + i * 3,
    lat: 60.6 + rnd() * 0.027,
    lng: 17.06 + rnd() * 0.054,
  }));
  const c = course({ name: "Lång bana", controls, finish: { lat: 60.61, lng: 17.08 } });
  const url = runCourseUrl(c);
  const payload = url.slice(RUN_URL_PREFIX.length);
  assert.ok(payload.length <= 240, `payload is ${payload.length} characters`);
  assert.equal(runCourseFromHash(new URL(url).hash).controls.length, 25);

  const scored = encodeRunCourse({
    ...c,
    controls: controls.map((x, i) => ({ ...x, points: 10 + 10 * (i % 5) })),
    score: { timeLimitMinutes: 90, penaltyPerMinute: 2 },
  });
  // One byte per control for points under 128, and two for the rules.
  assert.ok(scored.length <= payload.length + 42, `score payload is ${scored.length}`);
});

test("builds the link and the QR segments on the fixed prefix", () => {
  const c = course();
  assert.equal(RUN_URL_PREFIX, "https://run.controlfreak.se/#");
  const url = runCourseUrl(c);
  assert.equal(url, RUN_URL_PREFIX + encodeRunCourse(c));
  assert.match(url, /^[\x21-\x7e]+$/);
  const segments = runCourseQrSegments(c);
  assert.deepEqual(segments, { prefix: RUN_URL_PREFIX, payload: encodeRunCourse(c) });
  assert.equal(segments.prefix + segments.payload, url);
  // The browser keeps the fragment as it is.
  assert.equal(new URL(url).hash, `#${segments.payload}`);
});

test("refuses a newer version by the first byte alone", () => {
  const bytes = fromPayload(encodeRunCourse(course()));
  bytes[0] = 2;
  assert.equal(
    codeOf(() => decodeRunCourse(toPayload(bytes))),
    "newer-version",
  );
  // Even when the rest is garbage, the version decides.
  assert.equal(
    codeOf(() => decodeRunCourse(toPayload([2]))),
    "newer-version",
  );
  assert.equal(
    codeOf(() => decodeRunCourse(toPayload([0, 0]))),
    "unreadable",
  );
});

test("refuses unknown flags", () => {
  const bytes = fromPayload(encodeRunCourse(course()));
  bytes[1] |= 8;
  assert.equal(
    codeOf(() => decodeRunCourse(toPayload(bytes))),
    "unreadable",
  );
});

test("refuses broken payloads as unreadable", () => {
  const payload = encodeRunCourse(course());
  assert.equal(
    codeOf(() => decodeRunCourse(payload.slice(0, -6))),
    "unreadable",
  );
  assert.equal(
    codeOf(() => decodeRunCourse(payload.slice(0, -1))),
    "unreadable",
  );
  assert.equal(
    codeOf(() => decodeRunCourse(payload + "000")),
    "unreadable",
  );
  assert.equal(
    codeOf(() => decodeRunCourse("")),
    "unreadable",
  );
  // Lower case, characters outside the alphabet, and groups above 0xffff or 0xff.
  assert.equal(
    codeOf(() => decodeRunCourse(payload.toLowerCase())),
    "unreadable",
  );
  assert.equal(
    codeOf(() => decodeRunCourse("1 0P6")),
    "unreadable",
  );
  assert.equal(
    codeOf(() => decodeRunCourse("::::::")),
    "unreadable",
  );
  assert.equal(
    codeOf(() => decodeRunCourse(`${payload.slice(0, 3)}:9`)),
    "unreadable",
  );
  // Claims a million controls.
  assert.equal(
    codeOf(() => decodeRunCourse(toPayload([1, 0, 0, 0xc0, 0x84, 0x3d]))),
    "unreadable",
  );
});

test("reads the course from the whole fragment", () => {
  const payload = encodeRunCourse(course());
  assert.equal(runCourseFromHash(`#${payload}`).name, "Blå 5 km");
  assert.equal(runCourseFromHash(payload).name, "Blå 5 km");
  assert.equal(runCourseFromHash(""), null);
  assert.equal(runCourseFromHash("#"), null);
  // The legacy query style is read as base64url; a current payload there is not.
  assert.equal(
    codeOf(() => runCourseFromHash(`#c=${payload}`)),
    "unreadable",
  );
  assert.equal(
    codeOf(() => runCourseFromHash("#x=1")),
    "unreadable",
  );
});

/** Base64url without padding, as the legacy links were written. */
const toBase64Url = (bytes) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

test("reads legacy #c= links, never with score rules", () => {
  // The legacy links carry the same version 1 bytes as the current payload.
  const bytes = fromPayload(encodeRunCourse(course()));
  const value = toBase64Url(bytes);
  const back = runCourseFromHash(`#c=${value}`);
  assert.equal(back.name, "Blå 5 km");
  assert.equal(back.score, null);
  assert.deepEqual(back, decodeRunCourse(encodeRunCourse(course())));
  assert.deepEqual(back, decodeLegacyRunCourse(value));
  // Other keys around `c` were allowed by the legacy reader.
  assert.deepEqual(runCourseFromHash(`#x=1&c=${value}`), back);
  const noStartOrFinish = toBase64Url(
    fromPayload(encodeRunCourse(course({ start: null, finish: null, controls: [] }))),
  );
  assert.deepEqual(
    decodeLegacyRunCourse(noStartOrFinish),
    course({ start: null, finish: null, controls: [] }),
  );
});

test("refuses broken or newer legacy links", () => {
  const bytes = fromPayload(encodeRunCourse(course()));
  // The legacy format had no score flag: a legacy link with it is not one we wrote.
  const scored = [...bytes];
  scored[1] |= 4;
  assert.equal(
    codeOf(() => decodeLegacyRunCourse(toBase64Url(scored))),
    "unreadable",
  );
  // A newer version is decided by the first byte alone, as the legacy reader did.
  assert.equal(
    codeOf(() => decodeLegacyRunCourse("Ag")),
    "newer-version",
  );
  const value = toBase64Url(bytes);
  assert.equal(
    codeOf(() => decodeLegacyRunCourse(value.slice(0, -6))),
    "unreadable",
  );
  assert.equal(
    codeOf(() => decodeLegacyRunCourse(value + "AAAA")),
    "unreadable",
  );
  assert.equal(
    codeOf(() => decodeLegacyRunCourse("!!skräp??")),
    "unreadable",
  );
  assert.equal(
    codeOf(() => decodeLegacyRunCourse("")),
    "unreadable",
  );
  assert.equal(
    codeOf(() => decodeLegacyRunCourse("A")),
    "unreadable",
  );
  assert.equal(
    codeOf(() => runCourseFromHash("#c=")),
    "unreadable",
  );
});

/** Bytes of the earliest legacy layout (2026-10-17), as its encoder wrote them. */
function earliestBytes({ radius = 20, accuracy = 30, order = 0, flags = null, name, controls, finish }) {
  const out = [];
  const varint = (n) => {
    while (n >= 0x80) {
      out.push((n % 0x80) | 0x80);
      n = Math.floor(n / 0x80);
    }
    out.push(n);
  };
  const signed = (n) => varint(n < 0 ? -2 * n - 1 : 2 * n);
  out.push(1);
  varint(radius);
  varint(accuracy);
  out.push(order);
  out.push(flags ?? (finish ? 1 : 0));
  const utf8 = new TextEncoder().encode(name);
  varint(utf8.length);
  out.push(...utf8);
  varint(controls.length);
  let lat = 0;
  let lng = 0;
  const point = (p) => {
    const la = Math.round(p.lat * 1e5);
    const lo = Math.round(p.lng * 1e5);
    signed(la - lat);
    signed(lo - lng);
    lat = la;
    lng = lo;
  };
  for (const c of controls) {
    varint(c.code);
    point(c);
  }
  if (finish) point(finish);
  return out;
}

test("reads the earliest legacy layout, without start and score", () => {
  const c = course();
  for (const radius of [0, 1, 3, 10, 25, 200]) {
    for (const finish of [c.finish, null]) {
      const value = toBase64Url(earliestBytes({ ...c, radius, finish }));
      const back = decodeLegacyRunCourse(value);
      assert.equal(back.name, "Blå 5 km");
      assert.equal(back.start, null);
      assert.equal(back.score, null);
      assert.deepEqual(back.controls, c.controls);
      assert.deepEqual(back.finish, finish);
      assert.deepEqual(runCourseFromHash(`#c=${value}`), back);
    }
  }
});

test("refuses earliest-layout links with values it never wrote or cut short", () => {
  const c = course();
  const ok = earliestBytes(c);
  const bad = [
    earliestBytes({ ...c, order: 1 }),
    earliestBytes({ ...c, flags: 2 }),
    ok.slice(0, -3),
    [...ok, 0],
  ];
  for (const bytes of bad) {
    assert.equal(codeOf(() => decodeLegacyRunCourse(toBase64Url(bytes))), "unreadable");
  }
});

test("slim legacy links still read as the slim layout", () => {
  // Every slim legacy course of many shapes reads exactly as the current payload does.
  const names = ["", "A", "Blå 5 km", "x".repeat(40)];
  for (const name of names) {
    for (const start of [null, { lat: 61.3, lng: 17.06 }]) {
      for (const finish of [null, { lat: 61.3002, lng: 17.0605 }]) {
        for (const n of [0, 1, 3, 12]) {
          const controls = Array.from({ length: n }, (_, i) => ({
            code: 31 + i,
            lat: 61.3 + i * 0.0013,
            lng: 17.06 - i * 0.0011,
          }));
          const c = course({ name, start, finish, controls });
          const payload = encodeRunCourse(c);
          const value = toBase64Url(fromPayload(payload));
          assert.deepEqual(decodeLegacyRunCourse(value), decodeRunCourse(payload));
        }
      }
    }
  }
});
