# orienteering-formats – rules for development

This repository is **public**. Never commit secrets, keys or user data.

- Code and comments are in English, and every exported function and type has a JSDoc
  comment.
- Keep the package small. It holds only file formats, the types they need, the map
  reader that draws map files as SVG (`src/map/`, its own entry point), and the QR film
  and start list (`orienteering-formats/qr`). App logic and UI stay in the apps.
- Follow the change rules in README.md:
  - old files must stay readable,
  - versions follow semver,
  - `dist/` is rebuilt and committed,
  - every release is tagged.
- No runtime dependencies without agreement from both developers (HenrikF and
  proverhugo). Every dependency ends up in both apps and their license lists.
- Run `npm run build && npm test` before every commit. `npm test` runs the format tests
  on `dist/` and the map reader's tests in `src/map/*.test.ts` with Vitest.
