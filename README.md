# orienteering-formats

File formats shared by orienteering apps:

- **ControlFreak** (course setting) writes `.cfpack` and `.cfproj` files.
- **ControlFreak Event** (competition administration) reads them, and sends competitions and
  start lists as QR films.
- **The start clock** (startklocka) reads start lists from ControlFreak Event's QR films.
- **The runner app** (run.controlfreak.se) reads courses from the QR links ControlFreak
  prints for virtual controls.

Keeping the format code here means both apps read and write the files the same way, and
a change to the format is a deliberate new version rather than a silent break.

## Use

Depend on a tagged version, never on a branch:

```json
"orienteering-formats": "github:ControlFreak-orienteering/orienteering-formats#v0.15.0"
```

Reading a pack or project file (e.g. in ControlFreak Event):

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
  if (e instanceof FormatError) e.code; // "wrong-format" | "newer-version" | "unreadable" | "empty"
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
- **IOF XML CourseData and Purple Pen** course files, read into the same form as the
  exchange section, and IOF XML CourseData written from it; see "Course files from
  other programs".
- **IOF XML StartList** files (Eventor, timing programs), read into the start list
  form of the QR film, and written from it for Eventor's start list import; see
  "Course files from other programs".
- **Live competitions from QR codes**: create or update a competition on ControlFreak
  Live from Run course links, without a login; see "Live competitions from QR codes".
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
  in any order by the receiver. Moved here from ControlFreak Event; the frames are unchanged.
- **Start list** (`writeStartList`, `readStartList`), format `cf-startlist`: who starts when,
  for the start clock. Each runner has `time` ("HH:MM:SS") and `name`, and optionally
  `club`, `class`, `card`, `start`, `course` and `late`. Later versions only add fields, and
  the reader ignores what it does not know, so a start clock keeps reading lists from newer
  versions of ControlFreak Event.
- **Clock code** (`writeClockCode`, `readClockCode`, `ClockSampler`): a QR code with the
  sender's time (`CFT1|<milliseconds since 1970>`), redrawn several times a second, so that
  the start clock can set itself to ControlFreak Event's clock. `ClockSampler` keeps the code
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

## Live results sites

`orienteering-formats/cf-live` is the ControlFreak Live protocol: how ControlFreak Event
sends live results to a site an organiser runs, often built by a vibe-coding tool from the
prompt the app gives. The full description is `docs/custom-live/protocol.md` in
ControlFreak Event.

- **The app** reads the site's `info` (`parseInfo`), agrees on version, mode and encoding
  (`agree`), and builds delta uploads (`deltaBetween`).
- **The site** answers `info` (`infoAnswer`) and checks and applies uploads (`applyUpload`),
  after checking the key.
- `dist/cf-live.js` imports nothing, so a site can load it alone, pinned to a tag:

```ts
import { applyUpload, infoAnswer } from
  "https://cdn.jsdelivr.net/gh/ControlFreak-orienteering/orienteering-formats@v0.15.0/dist/cf-live.js";
```

**Compatibility:** sites are built once and rarely rebuilt, so the app agrees with every
site ever built. Within a protocol version fields are only added; a breaking change is a new
version, and the app keeps speaking every old one (`CF_LIVE_VERSIONS`). `info.prompt` tells
which prompt a site was built from (absent means 1), so the app can suggest rebuilding. The
`info` answers of every prompt version are frozen in `test/fixtures/cf-live/`.

## Live punches from ControlFreak Run

`orienteering-formats/run-live` is how ControlFreak Run sends a runner's punches to
ControlFreak Live, and how the site ranks them. A run goes either to a competition or, on
any course, to the course's page on the site, without a competition.

- **The organiser** creates the competition on the site, which gives a runner link
  (`runLiveLink`, `https://run.controlfreak.se/live#b=<base>&k=<key>`) for a QR code at the
  start or on the map.
- **Courses without a competition** need no organiser and no key: the phone sends to the site's keyless address,
  `{origin}/api/public/cf-run/open` (`RUN_LIVE_OPEN_PATH`, `runLiveOpenBase(origin)`), with
  the course link in the body (`courseLink`). The site groups the runners by
  `openCourseId` from `orienteering-formats/run`: the first 16 hex characters of the SHA-256
  of a canonical text of the course (`openCourseKey`: kind and score rules, start, control
  codes and positions on the 1e-5° grid, finish; not the name; score controls sorted). Two
  links of the same course meet on the same page; a control moved by a metre or given
  another code makes another course.
- **The phone** reads the link (`parseRunLiveLink`), makes an id and a secret for the run
  (`newRunnerId`) and sends the whole run each time with `PUT {base}/runners/{runnerId}`
  (`runLiveRunnerUrl`): the runner's name, the course's name and control codes, the start,
  the punches and the finish, and optionally the runner's club and the course link. Never the track or any
  position. The secret keeps one runner from overwriting another, on the keyless address too.
- **The site** checks each upload (`parseRunLiveBody`, which keeps `club` (at most 60
  characters) and `courseLink` within limits and drops them otherwise, and drops unknown
  fields), refuses another secret for a runner it already
  holds, and ranks the runners per course (`runLiveStandings`, each row with the runner's `club` or null).
  On a fixed-order course each control takes the first punch at it after the control before,
  in the order the punches were made, as Run's own result and MeOS do (since v0.16.1): a
  control passed early, or a code that is on the course twice, does not count out of order.
  The phone sends the run as soon as the runner is ready, before the start time, and reports
  the start beep as `startedAt` (null until then; since v0.17.0). Rows say `started`;
  senders without the field count as started. `runLiveAbandoned` tells a site which runs
  never started `RUN_LIVE_START_GRACE_MS` (2 minutes) after their start time, to leave out.
- `dist/run-live.js` imports nothing, like `cf-live`; `openCourseId` is in
  `orienteering-formats/run`, since it reads the course link.

**Compatibility:** runner links are printed, so `parseRunLiveLink` must keep reading every
link ever made. Within version 1, fields are only added (`club` and `courseLink` are such fields); a change an older site would misread is a new version. Course ids name pages
people link to, so `openCourseKey` and the hash never change (pinned in
`test/run-frozen.test.mjs`).

## Live competitions from QR codes

`orienteering-formats/live-competition` (since v0.19.0) is how ControlFreak Run and
ControlFreak Course create or update a competition on ControlFreak Live without a login.

- **The client** builds a request with `liveCompetitionRequest(name, courses)`. Each course is
  a Run course link or only its data (the text after the `#`); everything up to the first `#`
  is cut, empty and repeated courses are dropped, and a name over 120 characters is cut. It
  gives null for an empty name, no courses or more than 100 courses
  (`LIVE_COMPETITION_NAME_MAX`, `LIVE_COMPETITION_COURSES_MAX`). It sends one `POST` with the
  JSON to `liveCompetitionEndpoint(origin)`, `{origin}/api/public/cf-competition`
  (`LIVE_COMPETITION_PATH`).
- **The site** reads the body with `parseLiveCompetitionRequest` (same rules and limits) and
  answers `200` with `{ id, url, owned, published, outcome, taken }`: the competition's id and link,
  whether it has an owner on the site (`owned`, since v0.20.0; only the owner changes an owned
  competition, and a signed-in user takes over one without an owner on the site), what it did (`created`, `replaced` or `added`) and the courses it
  left in other competitions (`taken`, each `{ course, competition, owned }`; `owned` since
  v0.20.0). Other answers: `400` bad request, `409` every course taken by other competitions
  (with the same `taken` list since v0.20.0; read it with `parseLiveCompetitionConflict`), or the competition got an owner while the request was running ("owner changed"), `413` body too large, `429` too many new competitions from one address, `500`. CORS as in cf-live.
- **Publishing** (since v0.20.0): the request may hold `publish: true | false`
  (`liveCompetitionRequest(name, courses, publish?)`, set only when given), and the answer
  `published` (boolean, missing from older sites) says whether the results are public. Absent
  `publish`: a new competition is hidden, an existing one is unchanged.
- **The client** reads the answer with `parseLiveCompetitionResponse`. v0.19.0 sites also
  sent a 4-character admin `code`; since v0.20.0 the site sends none. `code`,
  `LIVE_COMPETITION_CODE_ALPHABET` and `normaliseLiveCompetitionCode` stay for older readers.
- **Linking an app to a Live account** (since v0.20.0): the app opens
  `liveLinkUrl(origin, app, returnOrigin)`, `{origin}/koppla?app=<run|course>&origin=<returnOrigin>`
  (`LIVE_LINK_PATH`). After sign-in the page posts a `LiveLinkMessage`
  (`liveLinkMessage(app, key, account)`: `{ type: "cf-live-link", v: 1, app, key, account }`,
  the key being 43 characters of base64url and `account` the e-mail) to `returnOrigin`. The app
  reads it with `parseLiveLinkMessage` (null for anything else) and must also check that
  `event.origin` is the Live site. It then sends `liveCompetitionHeaders(key)`, which adds
  `Authorization: Bearer <key>`; the site reads it with `parseLiveCompetitionKey`. A key the
  site does not know gets `401 {"error":"unknown key"}`: the app forgets the key and retries
  once without it.
- `dist/live-competition.js` imports nothing, like `cf-live`.

**Compatibility:** within version 1, fields are only added; anything else is a new version.

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
- **Older links**: the pre-release `#c=<base64url>` links are not supported (removed in
  v0.7.0); `runCourseFromHash` refuses them as `unreadable`.
- The QR library stays in the apps. The test vectors in `test/run.test.mjs` are shared
  with the apps.

### Compatibility rules for course links

Printed QR codes live for months, so the link format only ever grows:

- Compatibility is guaranteed from the v0.6.0 format onwards: every change must keep
  decoding all links and payloads of that format. Earlier pre-release formats (`#c=`
  links) are not supported.
- New data is added only additively: a new version byte, or a new flag that older readers
  refuse cleanly (`newer-version` / `unreadable`). Existing bytes are never reinterpreted.
- The payload alphabet, the packing (two bytes as three characters), the coordinate
  resolution (1e-5 degrees) and the link prefixes never change.
- `test/run-frozen.test.mjs` pins exact payloads to exact decoded courses. Its vectors are
  never changed or removed; every new version gets a new vector there.

## Course files from other programs

`orienteering-formats/iof` and `orienteering-formats/purple-pen` read the course files
other programs write, and give the courses in the same form as the exchange section
below (a `CourseSet`: a `CourseExchange` whose courses may also carry `family`,
`classNames`, `partlyRead` and `tapedRoutes`), so an app reads every course file the
same way. `orienteering-formats/iof` also writes that form as IOF XML, and reads and writes start
lists.

- **IOF XML CourseData**, versions 3.0 and 2.0.3 (OCAD, Condes, Purple Pen,
  ControlFreak): `readIofCourseData` gives the courses, `version`, `eventName` and
  `unpositioned` (ids of points the file gives no map position; they are at (0, 0)).
  A forked 3.0 course is written as one course per variation with a shared
  `family`; score courses have `order: "free"` and `scores`; marked routes
  (`specialInstruction` TapedRoute / FunnelTapedRoute) are `tapedRoutes`. Positions
  are millimetres on the printed map (`map.metersPerUnit` is the scale over 1000),
  flipped to the exchange rule's y downwards in both versions, with `lat`/`lng` when
  the file has `<Position>`; 2.0.3 files have no positions on the earth. A 3.0 file's
  `<TeamCourseAssignment>`s (a relay's forking: the course each team's runner runs
  per leg, as OCAD, Condes and MeOS write it) are `teamCourses` on the set, each team
  by `bib`, `teamName` and `className` with its `members`' `leg`, `legOrder`,
  `courseName` and `courseFamily`.
- **Writing IOF XML 3.0 CourseData**: `writeIofCourseData(set, options)` writes a
  `CourseSet` as the file timing systems read. Each control's `id` becomes the file's
  `<Id>` (give controls their codes as ids), positions are converted to millimetres at
  `map.scale` and flipped back to the map's y upwards, a forked course becomes one
  course per variation in a `<CourseFamily>`, lengths are the set's or the straight
  line at the scale, `classNames` become `<ClassCourseAssignment>` and `teamCourses`
  become `<TeamCourseAssignment>` (name a variation as written: "`<course> <code>`" in
  the family "`<course>`"). Options:
  `eventName`, `creator`, `createTime`, `mapCorners`. A set written here reads back
  the same.
- **IOF XML StartList**, versions 3.0 and 2.0.3 (Eventor's `/api/starts/event` and
  `/iofxml`): `readIofStartList` gives a `StartList` (the QR film's form, runners with
  `time` "HH:MM:SS" as the file's wall clock, `name`, `club`, `class`, `card`, `start`)
  with `version`; `looksLikeIofStartList` recognises the file. Runners without a start
  time are left out, and relay teams are not read.
- **Writing IOF XML 3.0 StartList**: `writeIofStartList(list, options)` writes a
  `StartList` as the file Eventor's start list import and timing programs read: one
  `<ClassStart>` per class in order of first runner, each runner's `name` split on its
  last word into given and family name (`splitRunnerName`), `club` as the organisation,
  `card` as `<ControlCard>`, and `course` and `start` at class level when the class's
  runners share them. Start times are the list's clock times on `options.date` (else
  `competition.date`, else today) with `options.utcOffsetMinutes` (else the computer's
  offset on that day). `creator`, `createTime` and `eventId` (Eventor's event id, as
  `<Event><Id>`) are the other options. Eventor matches runners without an Eventor id
  on name and club, and classes on their names, so the file's class names must be
  Eventor's. A list written here reads back the same.
- **Purple Pen** (.ppen): `readPurplePen` gives the courses, `title` and `mapFileName`.
  Purple Pen has no positions on the earth; an app that needs them reads the named
  map's georeference with `orienteering-formats/map` and converts the millimetres. A
  forked course is read along its first variation and marked `partlyRead`. A start or
  finish with a `<code>` gets it as its `label` ("S" or "M" without one). A file with
  no courses is refused as `empty`, unless `{ allowNoCourses: true }` asks for its
  points alone, e.g. a file that only places start points.
- `isForkedCourse(set, course)` says whether a course is forked in any of these ways.
- `joinCourseFamilies(set)` joins the courses of a 3.0 `family` into one forked course
  with `variations` (named after the family, id `family:<family>`, each variation coded
  by its course's name without the family's: "Stafett A" is "A"), the form ControlFreak
  files and 2.0.3 have, and gives each `teamCourses` member its `courseId` and
  `variationCode`.
- `decodeXmlBytes` turns a file's bytes into text by the encoding it declares (older
  files are often ISO-8859-1), and `looksLikeIofCourseData` / `looksLikePurplePen`
  recognise a file by its content.
- Errors are `FormatError`s: `unreadable` (broken XML), `wrong-format` (not that kind
  of file) and `empty` (no courses, no runners, or nothing to write). The readers use
  the browser's `DOMParser`; pass `parseXml` (e.g. from `@xmldom/xmldom`) where there
  is none.

```ts
import { decodeXmlBytes } from "orienteering-formats";
import { looksLikeIofCourseData, readIofCourseData } from "orienteering-formats/iof";
import { looksLikePurplePen, readPurplePen } from "orienteering-formats/purple-pen";

const text = decodeXmlBytes(new Uint8Array(await file.arrayBuffer()));
const set = looksLikePurplePen(text) ? readPurplePen(text) : readIofCourseData(text);
set.courses[0]?.controls; // control ids, start to finish, as in the exchange section
```

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
  patterns) and text symbols are drawn. In OCAD files, so are the symbols a line draws
  along itself: a cliff's tags, a fence's ticks, a dotted boundary, pylons and slope
  lines at corner points. Not yet drawn: a line's secondary symbols, and the symbols
  along lines in `.omap` files.
- **`.omap` files need a `DOMParser`.** Browsers have one; elsewhere pass `parseXml`
  (e.g. from `@xmldom/xmldom`).
- The entry point also exports the lower-level readers ControlFreak uses: the parsed
  OCAD map (`parseOcadFile`, `renderMapSvg`), cropping (`cropOcad`, `cropOmapXml`) and
  conversion between map and earth coordinates (`mapToWgs84`, `wgs84ToMap`).
- **A parsed `.omap`.** `parseOmapModel(doc)` gives the colours, symbols and objects of
  an OpenOrienteering Mapper file as plain data (`OmapModel`), in the file's units. Each
  symbol has an `appearance` string, the canonical JSON of its definition with colours
  by name: two symbols with the same string look the same, so maps can be compared.
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
