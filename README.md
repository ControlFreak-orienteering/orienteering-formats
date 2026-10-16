# orienteering-formats

File formats shared by two orienteering apps:

- **ControlFreak** (course setting) writes `.cfpack` and `.cfproj` files.
- **CompetitionFreak** (competition administration) reads them.

Keeping the format code here means both apps read and write the files the same way, and
a change to the format is a deliberate new version rather than a silent break.

## Use

Depend on a tagged version, never on a branch:

```json
"orienteering-formats": "github:HenrikF/orienteering-formats#v0.3.0"
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
