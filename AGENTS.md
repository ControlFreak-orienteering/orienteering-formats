# orienteering-formats – rules for development

This repository is **public**. Never commit secrets, keys or user data.

- Code and comments are in English, and every exported function and type has a JSDoc
  comment.
- Keep the package small. It holds only file formats, the types they need, the map
  reader that draws map files as SVG (`src/map/`, its own entry point), the QR film
  start list and clock code (`orienteering-formats/qr`), and the course link for virtual
  controls (`orienteering-formats/run`). App logic and UI stay in the apps.
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
  - Every change must keep decoding every earlier link and payload: the current
    `https://run.controlfreak.se/#<payload>` and the legacy `#c=<base64url>` links
    (`https://run.controlfreak.se/#c=…`, `https://course.controlfreak.se/run#c=…`), which are
    read but never written.
  - Add new data only additively: a new version byte or a new flag that older readers
    refuse cleanly (`newer-version` for a version, `unreadable` for an unknown flag). Never
    reinterpret existing bytes.
  - Never change the payload alphabet, the packing, the coordinate resolution (1e-5°) or
    the link prefixes.
  - `test/run-frozen.test.mjs` pins exact payloads to exact courses. Never change or remove
    a vector there; add one for every new version, flag or link form.
