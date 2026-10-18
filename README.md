# orienteering-formats

File formats shared by orienteering apps:

- **ControlFreak** (course setting) writes `.cfpack` and `.cfproj` files.
- **CompetitionFreak** (competition administration) reads them, and sends competitions and
  start lists as QR films.
- **The start clock** (startklocka) reads start lists from CompetitionFreak's QR films.
- **The runner app** (run.controlfreak.se) reads courses from the QR links ControlFreak
  prints for virtual controls.

Keeping the format code here means both apps read and write the files the same way, and
a change to the format is a deliberate new version rather than a silent break.

## Use

Depend on a tagged version, never on a branch:

```json
"orienteering-formats": "github:HenrikF/orienteering-formats#v0.6.0"
```

Reading a pack or project file (e.g. in CompetitionFreak):

```ts
import { FormatError, looksLikeCfpack, readCfpack, readProjectFile } from "orienteering-formats";

try {
  if (await looksLikeCfpack(file)) {
    const { envelope, map } = await readCfpack(await file.arrayBuffer());
    envelope.exchange; // courses and controls, or null in files from before v0.2.0
    map?.bytes;        // the original map file (.ocd/.omap), byte for byte
  } else {
    const envelope = readProjectFile(await file.text());
  }
} catch (e) {
  if (e instanceof FormatError) e.code; // "wrong-format" | "newer-version" | "unreadable"
}
```

Writing (ControlFreak):

```ts
import { createProjectEnvelope, writeCfpack, writeProjectFile } from "orienteering-formats";

const envelope = createProjectEnvelope({ writtenBy: "ControlFreak", project, work, exchange });
const text = writeProjectFile(envelope);                          // .cfproj
const blob = await writeCfpack(envelope, { bytes, name, id });    // .cfpack
```

The package has no runtime dependencies; TypeScript, Vitest and xmldom are only
development tools. It uses `CompressionStream`, `DecompressionStream`, `Blob`,
`TextEncoder` and `TextDecoder`, which every current browser and Node 18+ have.

## Contents

- **`.cfproj`**: a project as indented JSON, without the map. See `src/cfproj.ts`.
- **`.cfpack`**: the same JSON as a header, followed by the map file, in one binary
  file. The byte layout is documented in `src/cfpack.ts`.
- **Errors** are a `FormatError` with a `code`; each app turns the code into its own
  text.

Both files hold the same JSON object (the *envelope*):

| Field       | Content                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| `format`    | always `"controlfreak-project"`                                         |
| `version`   | format version, `1`                                                     |
| `writtenBy` | name of the app that wrote the file; information only                   |
| `savedAt`   | milliseconds since 1970                                                 |
| `project`   | `name`, `mapName`, `mapId` (content hash), `scale`, `origin`            |
| `work`      | ControlFreak's own course model. **Other apps must not read it**; this package passes it through as `unknown`. |
| `exchange`  | optional; courses and controls for other apps, see below                |
| `map`       | `.cfpack` only: `name`, `id`, `encoding` (`gzip`/`raw`), `byteLength`   |

## QR films and start lists

`orienteering-formats/qr` moves data between devices with a camera, with no network:

- **QR film** (`encodeFrames`, `FrameCollector`): a text is compressed and cut into QR codes
  (`CFQ1|<id>|<index>|<count>|<data>`), shown in a loop on the sending screen and collected
  in any order by the receiver. Moved here from CompetitionFreak; the frames are unchanged.
- **Start list** (`writeStartList`, `readStartList`), format `cf-startlist`: who starts when,
  for the start clock. Each runner has `time` ("HH:MM:SS") and `name`, and optionally
  `club`, `class`, `card`, `start`, `course` and `late`. Later versions only add fields, and
  the reader ignores what it does not know, so a start clock keeps reading lists from newer
  versions of CompetitionFreak.
- **Clock code** (`writeClockCode`, `readClockCode`, `ClockSampler`): a QR code with the
  sender's time (`CFT1|<milliseconds since 1970>`), redrawn several times a second, so that
  the start clock can set itself to CompetitionFreak's clock. `ClockSampler` keeps the code
  that arrived with the least delay; its `offsetMs` is what to add to the receiver's clock.

```ts
import { encodeFrames, FrameCollector, readStartList, writeStartList } from "orienteering-formats/qr";

const frames = await encodeFrames(writeStartList(list)); // show these as QR codes
const collector = new FrameCollector();
collector.add(textFromCamera); // until collector.complete()
const received = readStartList(await collector.payload());

// Clock code: the sender redraws writeClockCode(Date.now()) about ten times a second.
const sampler = new ClockSampler();
sampler.add(textFromCamera, timePictureWasTaken); // for a few seconds
sampler.offset(); // { offsetMs, samples }, offsetMs > 0 when the sender is ahead
```

Errors are `FormatError`s with a code (`wrong-format`, `unreadable`), for the app to put
into words.

## Course links for virtual controls

`orienteering-formats/run` writes and reads the course in the QR links for the runner app:
`https://run.controlfreak.se/#<payload>`. ControlFreak prints the link as a QR code; the
runner app reads the course from `location.hash`. The course sits after `#`, so it never
reaches a server.

```ts
import {
  decodeRunCourse, encodeRunCourse, FormatError,
  runCourseFromHash, runCourseQrSegments, runCourseUrl, type RunCourse,
} from "orienteering-formats/run";

const course: RunCourse = {
  v: 1,
  name: "Testbana",
  start: { lat: 61.3, lng: 17.06 },          // or null
  controls: [{ code: 31, lat: 61.3021, lng: 17.0635 }],
  finish: { lat: 61.3002, lng: 17.0605 },    // or null
  score: null,                               // or { timeLimitMinutes, penaltyPerMinute }
};
runCourseUrl(course); // "https://run.controlfreak.se/#160P..."

try {
  const read = runCourseFromHash(location.hash); // null when there is no fragment
} catch (e) {
  if (e instanceof FormatError) e.code; // "unreadable" | "newer-version"
}

// The QR code: the prefix as a byte segment, the payload as an alphanumeric segment.
const { prefix, payload } = runCourseQrSegments(course);
const qr = QrCode.encodeSegments(
  [QrSegment.makeBytes([...new TextEncoder().encode(prefix)]), QrSegment.makeAlphanumeric(payload)],
  QrCode.Ecc.MEDIUM,
);
```

- **Payload**: binary, written with the 43 characters `0-9A-Z$*+-./:`, two bytes as three
  characters and a last odd byte as two (like base45, RFC 9285, without space and `%`).
  They are all in the QR alphanumeric mode and need no escaping in a URL fragment. The
  whole fragment is the payload.
- **Build the QR code from two segments.** Encoding the whole link as one text puts it in
  byte mode, because the prefix is lower case, and loses the gain (version 12 instead of
  10 for 25 controls).
- **Content**: version byte, flags (finish, start, score course), name (UTF-8), and start,
  controls (code, position) and finish. Positions are in 1e-5 degrees (about 1 m), each a
  delta from the one before. A score course (rogaining) also has a time limit in minutes,
  a penalty per started minute over it, and points per control. The byte layout is in
  `src/run/course.ts`.
- **Versions**: the first byte is the version, read before anything else; a payload from
  a newer version is refused with `newer-version` without reading the rest.
- **Size**: 25 controls over 3×3 km give a 224-character payload, a QR code of version 10
  with error correction M.
- **Legacy links**: before v0.6.0 the apps wrote `https://run.controlfreak.se/#c=<base64url>`
  (and earlier `https://course.controlfreak.se/run#c=<base64url>`), base64url of the same
  version 1 bytes without the score flag. `runCourseFromHash` still reads them (with
  `score: null`), and `decodeLegacyRunCourse` and `RUN_LEGACY_URL_PREFIXES` are exported
  for apps that classify scanned links. The package never writes them.
- **Earliest legacy layout**: the very first release (Course, 2026-10-17) wrote
  `https://course.controlfreak.se/run#c=<base64url>` with a different version 1 layout:
  version (1) · radius m (varint) · accuracy m (varint) · order (1 byte, 0 = sequence) ·
  flags (1 byte, bit 0 = finish) · name length (varint) · name (UTF-8) · control count
  (varint) · per control: code (varint), lat delta, lng delta · [finish: lat delta, lng
  delta]. No start; positions as in version 1. Since v0.6.2 `decodeLegacyRunCourse` (and
  so `runCourseFromHash`) also reads it, with `start: null` and `score: null`; the stored
  radius and accuracy are ignored, because the runner app's punching rules are fixed. Both
  layouts start with byte 1, so the reader tries both and accepts only one that reads
  cleanly, uses exactly all bytes and holds only values that layout could hold (slim
  flags at most 3; earliest order 0 and flags at most 1); if both qualify, real WGS84
  positions decide, then the slim layout wins.
- The QR library stays in the apps. The test vectors in `test/run.test.mjs` are shared
  with the apps.

### Compatibility rules for course links

Printed QR codes live for months, so the link format only ever grows:

- Every change must keep decoding all earlier links and payloads, including the legacy
  `#c=` links in both their layouts (the slim one and the earliest one of 2026-10-17).
- New data is added only additively: a new version byte, or a new flag that older readers
  refuse cleanly (`newer-version` / `unreadable`). Existing bytes are never reinterpreted.
- The payload alphabet, the packing (two bytes as three characters), the coordinate
  resolution (1e-5 degrees) and the link prefixes never change.
- `test/run-frozen.test.mjs` pins exact payloads to exact decoded courses. Its vectors are
  never changed or removed; every new version gets a new vector there.

## Map files

`orienteering-formats/map` reads the map files ControlFreak opens and draws them as SVG:
OCAD (`.ocd`, versions 8 and 10–2018) and OpenOrienteering Mapper (`.omap`, `.xmap`). It
is a separate entry point, so an app that only reads `.cfpack` files does not bundle it.

```ts
import { MapError, mapSvgMarkup, readMapFile } from "orienteering-formats/map";

try {
  const drawing = readMapFile(map.bytes, map.name); // e.g. the map from a .cfpack
  drawing.viewBox;      // "minX minY width height", in map units
  drawing.innerMarkup;  // the SVG content, without <svg>
  drawing.scale;        // e.g. 10000
  drawing.georef;       // where the map lies on earth, or null
  const svg = mapSvgMarkup(drawing); // a whole SVG document
} catch (e) {
  if (e instanceof MapError) e.code; // "unsupported-file" | "not-ocad" | "ocad-version" | ...
}
```

- **The SVG's units are the map file's own**, x to the right and y downwards: the same
  coordinates as the controls in the exchange section below. A course drawn in the same
  `viewBox` lands on the map without conversion.
- **Legible rather than complete.** Point, line, area (with holes, hatching and
  patterns) and text symbols are drawn; symbols spaced along a line (fence tags, cliff
  ticks) are not.
- **`.omap` files need a `DOMParser`.** Browsers have one; elsewhere pass `parseXml`
  (e.g. from `@xmldom/xmldom`).
- The entry point also exports the lower-level readers ControlFreak uses: the parsed
  OCAD map (`parseOcadFile`, `renderMapSvg`), cropping (`cropOcad`, `cropOmapXml`) and
  conversion between map and earth coordinates (`mapToWgs84`, `wgs84ToMap`).
- **Tests** can build small OCAD files with `OcdFileBuilder` from
  `orienteering-formats/map-testing`.

## The exchange section

`exchange` is the part of the file other apps read. It is optional: files from before
v0.2.0 have none, and the readers then give `exchange: null`. The types are in
`src/exchange.ts`; the readers check every field and drop entries they cannot use.

```ts
type CourseExchange = {
  map?: {
    scale?: number;          // map scale denominator, e.g. 10000
    metersPerUnit?: number;  // ground metres per map unit
    georeference?: {         // absent for maps without a known grid
      easting: number; northing: number; grivationDeg: number;
      projection: {          // transverse Mercator (UTM, SWEREF 99 TM, ...)
        centralMeridian: number; latitudeOfOrigin: number; scaleFactor: number;
        falseEasting: number; falseNorthing: number;
        ellipsoid: { a: number; f: number };
      };
    };
  };
  controls: {
    id: string;                                       // referred to by courses; not a punch code
    kind: "start" | "control" | "crossing" | "finish";
    codes: number[];                                  // punch codes; [] for start, finish, crossing
    label?: string;                                   // e.g. "S1", "M1"
    x: number; y: number;                             // map units, x right, y down
    lat?: number; lng?: number;                       // WGS84, when georeferenced
  }[];
  courses: {
    id: string;                     // stable between saves
    name: string;
    order: "fixed" | "free";        // "free" for score courses
    controls: string[];             // control ids, start to finish
    lengthMeters?: number;
    climbMeters?: number;
    printScale?: number;
    scores?: Record<string, number>;  // points per control id (score courses)
    variations?: { code: string; controls: string[]; lengthMeters?: number }[];
  }[];
};
```

- **Coordinates** are in the map file's own units, as ControlFreak draws the map:
  x to the right, y downwards. Metres from the map's origin are
  `east = x * metersPerUnit` and `north = -y * metersPerUnit`.
- **Start and finish** are points of their own. Courses that share a start code and
  position share the point.
- **Crossing points** (`kind: "crossing"`) are part of the course order but are not
  punched.
- **Forked courses** list every variation in `variations`; `controls` is then the first
  variation.
- **Every control** is listed, also those not yet used by any course.
- **Classes** are not in the section: ControlFreak does not know them. They may be added
  later as an optional field.

Example:

```json
{
  "map": { "scale": 10000, "metersPerUnit": 0.1 },
  "controls": [
    { "id": "c1", "kind": "control", "codes": [31], "x": 1000, "y": 2000 },
    { "id": "c2", "kind": "control", "codes": [32], "x": 3000, "y": 2500 },
    { "id": "c3", "kind": "control", "codes": [33], "x": 2000, "y": 4000 },
    { "id": "c4", "kind": "crossing", "codes": [], "x": 4000, "y": 4500 },
    { "id": "c5", "kind": "control", "codes": [35], "x": 5000, "y": 3000 },
    { "id": "start1", "kind": "start", "codes": [], "label": "S1", "x": 0, "y": 0 },
    { "id": "finish1", "kind": "finish", "codes": [], "label": "M1", "x": 6000, "y": 6000 }
  ],
  "courses": [
    {
      "id": "1", "name": "Bana 1", "order": "fixed",
      "controls": ["start1", "c1", "c4", "c5", "finish1"],
      "lengthMeters": 1111, "climbMeters": 45, "printScale": 10000
    },
    {
      "id": "2", "name": "Bana 2 gafflad", "order": "fixed",
      "controls": ["start1", "c1", "c2", "c5", "finish1"],
      "lengthMeters": 2300, "printScale": 7500,
      "variations": [
        { "code": "A", "controls": ["start1", "c1", "c2", "c5", "finish1"], "lengthMeters": 952 },
        { "code": "B", "controls": ["start1", "c1", "c3", "c5", "finish1"], "lengthMeters": 1080 }
      ]
    }
  ]
}
```

## Rules for changes

- **Files are kept for years.** A new version must still read every file that an older
  version could read.
- **Versions follow semver.**
  - Patch (0.1.x): fixes.
  - Minor (0.x.0): additions.
  - Breaking changes need a new major version and a migration note in the README.
- **`dist/` is committed.** Apps install this package straight from GitHub, and package
  managers do not build dependencies. Run `npm run build` and commit `dist/` together
  with the source.
- **Release by tagging:** `git tag vX.Y.Z && git push origin vX.Y.Z`. Then update the
  version in each app on its own branch and test it before merging.
- **Never put secrets, keys or user data** in this repository; it is public.

## License

MIT, see `LICENSE`.
