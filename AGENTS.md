# orienteering-formats – rules for development

This repository is **public**. Never commit secrets, keys or user data.

- Code and comments are in English, and every exported function and type has a JSDoc
  comment.
- Keep the package small. It holds only file formats, the types they need, the map
  reader that draws map files as SVG (`src/map/`, its own entry point), the QR film
  start list and clock code (`orienteering-formats/qr`), the course link for virtual
  controls (`orienteering-formats/run`), the live results protocol
  (`orienteering-formats/cf-live`), the live punches from ControlFreak Run
  (`orienteering-formats/run-live`), and the readers of other programs' course
  files (`orienteering-formats/iof`, `orienteering-formats/purple-pen`), which give
  courses in the exchange section's form, with the IOF XML writer and start list reader
  beside them. App logic and UI stay in the apps.
- Follow the change rules in README.md:
  - old files must stay readable,
  - versions follow semver,
  - `dist/` is rebuilt and committed,
  - every release is tagged.
- No runtime dependencies without agreement from both developers (HenrikF and
  proverhugo). Every dependency ends up in both apps and their license lists.
- Run `npm run build && npm test` before every commit. `npm test` runs the format tests
  on `dist/` and the map reader's tests in `src/map/*.test.ts` with Vitest.
- **Course links (`src/run/`) must stay backward compatible.** Printed QR codes live for
  months, on maps nobody reprints.
  - Compatibility is guaranteed from the v0.6.0 format onwards: every change must keep
    decoding every link and payload of the current format,
    `https://run.controlfreak.se/#<payload>`. Earlier pre-release `#c=<base64url>` links were
    never distributed and are not supported (removed in v0.7.0); `runCourseFromHash` refuses
    them as `unreadable`.
  - Add new data only additively: a new version byte or a new flag that older readers
    refuse cleanly (`newer-version` for a version, `unreadable` for an unknown flag). Never
    reinterpret existing bytes.
  - Never change the payload alphabet, the packing, the coordinate resolution (1e-5°) or
    the link prefixes.
  - `test/run-frozen.test.mjs` pins exact payloads to exact courses. Never change or remove
    a vector there (the pre-release vectors were dropped in v0.7.0); add one for every new version, flag or link form.
- **The live results protocol (`src/cf-live.ts`) must stay backward compatible.** Sites
  are built once from a prompt, by anyone, and often never rebuilt, so the app must keep
  talking to every site ever built.
  - Within a protocol version, only add optional fields. Never rename, remove or change the
    meaning of a field, a status code or an `info` value.
  - A change an older site would misread gets a new version in `CF_LIVE_VERSIONS`. Never
    remove a version from that list.
  - When the prompt in ControlFreak Event changes, raise `CF_LIVE_PROMPT_VERSION`, say what
    changed in `CF_LIVE_PROMPT_CHANGES` and add its `info` answers to
    `test/fixtures/cf-live/`. Never change or remove a fixture there.
  - `dist/cf-live.js` must not import anything, so a site can load it alone from a CDN.
- **Live punches from Run (`src/run-live.ts`) must stay backward compatible.** Runner links
  are printed on maps and at starts: never change what `parseRunLiveLink` reads or the
  link prefix. Within version 1 only add optional fields; anything else is a new version.
  `dist/run-live.js` must not import anything.
