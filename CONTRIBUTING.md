# Contributing to Pawse

Thanks for helping. Bug reports, ideas, translations and code are all welcome.

## Reporting a bug

Open an issue with the bug template and include:
- the app version (Settings → About) and your phone model and OS version;
- what you did, what you expected and what happened;
- for playback problems, the log from **Settings → About → Diagnostics → Copy diagnostics**.

Please don't post your Google account details or cookies anywhere. The diagnostics log never contains them.

## Working on the code

```sh
pnpm install
pnpm --filter pawse exec expo run:ios    # or expo run:android
pnpm verify                             # typecheck, lint and tests
```

- **Style**: Biome formats the code (`pnpm format`); double quotes, and comments kept to a line or two that explain why.
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org), e.g. `fix(player): resume after a call`.
- **Layout**: app code lives in `apps/pawse`; engine code stays app-agnostic in `packages/` (no imports from the app).
- **Tests**: add focused tests for engine, parsing and matching logic you change; UI changes need screenshots in the pull request.
- **Changelog**: add a line under `## [Unreleased]` in `apps/pawse/CHANGELOG.md` for anything a user would notice.

## Pull requests

Keep each pull request to one change, describe what and why, and link the issue it fixes. By contributing you agree that your work is released under the project's licence, GPL-3.0-or-later with the additional permission in [NOTICE.md](NOTICE.md).

## Conduct

Be kind and assume good intent. See the [Code of Conduct](CODE_OF_CONDUCT.md).
