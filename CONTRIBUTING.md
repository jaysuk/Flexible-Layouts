# Contributing

## Commit messages — Conventional Commits

Release notes are generated automatically from commit messages, so please format them as
[Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description
```

- **type** (required) — one of:
  | type | shows up under | use for |
  |------|----------------|---------|
  | `feat` | ✨ Features | a new feature/widget/capability |
  | `fix` | 🛠️ Fixes | a bug fix |
  | `perf` | ⚡ Performance | a performance improvement |
  | `refactor` | ♻️ Refactoring | code change that isn't a feature or fix |
  | `docs` | 📄 Documentation | docs only |
  | `test` | 🧪 Tests | tests only |
  | `chore` / `ci` / `build` / `style` | 🧹 Chores & CI | tooling, deps, formatting |
- **scope** (optional but encouraged) — the area touched, e.g. `files`, `explorer`, `theme`,
  `io`, `grid`. It's rendered in **bold** in the notes.
- **breaking change** — add a `!` after the type/scope (`feat(api)!: …`) or a `BREAKING CHANGE:`
  line in the body. These are listed first under ⚠️ Breaking changes.

Examples:

```
feat(files): show slicer thumbnails in the file browser
fix(explorer): keep the last directory tab so the "+" stays reachable
perf(grid): faster pack arrange
chore(ci): build releases on Node 24
feat(layout)!: drop the legacy single-document format
```

Anything that doesn't match falls under "📦 Other changes", so it's not lost — it's just nicer
when it's categorised. Preview the notes for the pending release any time with `npm run changelog`.

## Cutting a release

Releases are fully built in CI — you never build locally for a release.

1. Make sure `main` is green.
2. Bump + tag in one step:
   ```sh
   npm run release -- 1.0.12          # bump plugin.json + package.json, commit, tag v1.0.12
   git push && git push origin v1.0.12
   # or do both at once:
   npm run release -- 1.0.12 --push
   ```
3. Pushing the `v*` tag triggers **`.github/workflows/release.yml`**, which builds
   `FlexibleLayouts-1.0.12.zip` against DuetWebControl's source, generates the changelog from the
   commits since the previous tag, and creates a **draft** GitHub Release with the ZIP attached.
4. Open the draft, give it a title (we use a yoga/flexibility pun per release 🤸), tweak the notes
   if you like, and **Publish**.

The workflow guards that the tag matches the version in `plugin.json`, so a release can never ship a
mismatched build.
