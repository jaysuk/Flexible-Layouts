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
when it's categorised. To preview the notes for a pending release, run the Release workflow by hand from the Actions tab (it prints them to the run summary without publishing).

## Cutting a release

Releases are fully built in CI — you never build locally for a release.

1. Make sure `main` is green.
2. Run:
   ```sh
   npm run release -- 1.0.12 --push
   ```
   This drafts the release notes with Claude into `CHANGELOG.md` (from the commit messages since the previous
   tag), pauses so you can read and edit them, then bumps `plugin.json` + `package.json`, commits
   (notes included), tags `v1.0.12` and pushes. Without `--push` it stops after tagging
   (`git push && git push origin v1.0.12` when ready); `--no-notes` skips the draft.
3. Pushing the `v*` tag triggers **`.github/workflows/release.yml`**, which calls the shared release workflow
   ([jaysuk/dwc-plugin-workflows](https://github.com/jaysuk/dwc-plugin-workflows)): it builds
   `FlexibleLayouts-1.0.12.zip` against DuetWebControl’s source, picks the release title and **publishes** the
   GitHub Release with the ZIP attached. No manual step — once the tag is pushed, it ships.

To rehearse without publishing, run the Release workflow by hand from the Actions tab: it builds the ZIP as an
artifact and prints the title and notes in the run summary.

That’s it. The two generated bits:

- **Title** — a yoga/flexibility pun per release 🤸, taken in order from
  [`scripts/release-titles.txt`](scripts/release-titles.txt) (the Nth tag gets the Nth line). Edit
  that file to add/reorder puns.
- **Notes** — the `CHANGELOG.md` section for the version (drafted for you, edit freely); the
  Conventional-Commit list from the commits since the previous tag is kept collapsed under it, and is
  the notes if there is no section. A footer is appended automatically with install instructions, the
  **DuetWebControl version the ZIP was built against**, and a call-to-action to contribute layouts to the
  [community gallery](https://github.com/jaysuk/flexible-layouts-gallery) (the gallery text lives in
  [`.github/release-footer.md`](.github/release-footer.md)).

The pun list wraps if it runs out, and CI (plus `npm run release`) warns once fewer than five unused
titles remain — top up [`scripts/release-titles.txt`](scripts/release-titles.txt) when you see that.

The workflow guards that the tag matches the version in `plugin.json`, so a release can never ship a
mismatched build.
