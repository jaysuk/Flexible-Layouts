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
   commits since the previous tag, picks the release title, and **publishes** the GitHub Release with
   the ZIP attached. No manual step — once the tag is pushed, it ships.

That's it. The two generated bits:

- **Title** — a yoga/flexibility pun per release 🤸, taken in order from
  [`scripts/release-titles.txt`](scripts/release-titles.txt) (the Nth tag gets the Nth line). Edit
  that file to add/reorder puns; preview with `npm run release-title`.
- **Notes** — the Conventional-Commit changelog; preview with `npm run changelog`. A footer is appended
  automatically with install instructions, the **DuetWebControl version the ZIP was built against**, and
  a call-to-action to contribute layouts to the [community gallery](https://github.com/jaysuk/flexible-layouts-gallery)
  (see [`scripts/release-footer.mjs`](scripts/release-footer.mjs)).

The pun list wraps if it runs out, and CI (plus `npm run release`) warns once fewer than five unused
titles remain — top up [`scripts/release-titles.txt`](scripts/release-titles.txt) when you see that.

The workflow guards that the tag matches the version in `plugin.json`, so a release can never ship a
mismatched build. (Prefer a draft for a given release? Flip `draft: false` → `true` in the workflow.)
