# orienteering-formats

File formats shared by two orienteering apps:

- **ControlFreak** (course setting) writes `.cfpack` and `.cfproj` files.
- **CompetitionFreak** (competition administration) reads them.

Keeping the format code here means both apps read and write the files the same way, and
a change to the format is a deliberate new version rather than a silent break.

## Use

Depend on a tagged version, never on a branch:

```json
"orienteering-formats": "github:HenrikF/orienteering-formats#v0.1.0"
```

```ts
import { hasCfpackMagic } from "orienteering-formats";
```

## Contents

- `.cfpack`: project and map in one file. The byte layout is documented in
  `src/cfpack.ts`.
- Version 0.1.0 only recognises the file type. Reading the project and the map moves
  here from ControlFreak in a later version.

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
