# Engineering conventions

Read with `docs/DEV.md` (commands and layout) and, for Finance, `apps/finance/docs/SPEC.md` (what to build). These are binding for every app and package.

## Where code goes
- **A package** (`packages/*`, imported as `@studio/<name>`) holds anything useful to an unrelated consumer app (split bills, a health tracker): tokens, UI, motion, charts, money, dates, generic data plumbing.
- **An app** (`apps/<name>`, own code via the `@/` alias) holds everything about its product. For Finance: transactions, accounts, budgets, categories, the schema and repos, screens and features.
- If unsure, keep it in the app; extract later.
- **Boundaries**: package code never uses `@/` and never imports app code. Inside a package use relative imports; across packages use `@studio/<pkg>`. Direction only: config, then dates and money, then theme, then icons and motion, then ui and charts, then data. No cycles.
- Entry points are the package `index.ts` (plus `@studio/charts/{lib,components}`, `@studio/data/{provider,files,sync}`); do not deep-import into `src/`. Export new public modules from the index.
- Classes used in a package are generated through the `@source` line in the app's `global.css`; theme CSS variables stay in the app.
- Per-app theming: `configureTheme({ accentPreset | accent })` from `@studio/theme`. Category palette keys (`categoryKeys`) are stable because stored data refers to them.
- Tests live next to the code they test, in the package or app that owns it. `pnpm test` runs all of them.

## Environment
- pnpm only; there is no npm/npx (`pnpm exec`, `pnpm dlx`).
- Add native dependencies with `pnpm exec expo install`. Native modules outside Expo Go are fine; the app then ships through the iOS workflow (see `docs/DEV.md`).
- The React Compiler is on. Never name a binding `Symbol`, because the compiler emits `Symbol.for`. Lint enforces `react-hooks/set-state-in-effect`.

## Data
- **Reads**: Finance hooks from `@/data/hooks` (`useSettings`, `useSetting(key)` → `[value, set]`, `useAccounts`, `useCategories(kind)`, `usePeriodTransactions(filter)`, `useTransaction(id)`, `useRecentTransactions(n)`, `usePeriodSummary`, `useTitleSuggestions`, `useUpcoming`, `useInsights`, `useBudgets`, `useTodayKey`). Never put raw SQL in screens. A new read gets a new hook file in `src/data/hooks/`.
- **Writes**: always through `useActions()` from `@/data/actions`. It refreshes every live hook. Repos throw `ValidationError` with a typed `.code`.
- `useDb()` is for reads only, inside hooks.
- **Money**: integer minor units everywhere. Format only with `formatMoney` / `formatMoneyForSpeech` from `@studio/money`, using the `show_decimals` setting in lists. Amounts are never floats.
- **Dates**: `@studio/dates` (`toDateKey`, `periodFor`, `periodLabel`, `dayLabel`, …), honouring the `week_start` and `month_start` settings.
- **Undo delete**: `const snap = actions.transactions.delete(id)`, then `showToast({ message: 'Deleted', actionLabel: 'Undo', onAction: () => actions.transactions.restore(snap) })`.

## UI
- **Text**: `<Text variant tone numeric>` from `@studio/ui`. Variants follow SPEC §5.3; tones are default/secondary/tertiary/accent/income/expense/warning/inverted. Amounts always use `numeric`.
- **Icons**: `SymbolIcon` (SF Symbols on iOS; the MaterialIcons fallback comes from `symbolFallbacks.ts` in `@studio/icons`, so add any new SF name there).
- **Classes**:
  - surfaces: `bg-bg`, `bg-surface`, `bg-elevated`, `bg-fill`, `bg-accent`, `bg-accent-soft`
  - text: `text-foreground`, `text-secondary`, `text-tertiary`, `text-accent`, `text-income`, `text-expense`, `text-warning`
  - category colours: `bg-cat-<key>` (chart data), `bg-cat-<key>-ink` (tile fills); `text-accent` is now `text-accent-text` (brass link colour)
  - alpha colours: `withAlpha(hex, a)` with `useTokens()`
  - hairlines: `StyleSheet.hairlineWidth` with the `separator` token
- **Raw values** (Skia, Reanimated, native props): `useTokens()` from `@studio/theme`.
- **Haptics**: `haptic(kind)` from `@studio/theme`. It is already gated by the Haptics setting.
- **Building blocks**:
  - `@studio/ui` primitives: Button, Input, Card, Separator, Switch, Badge, Skeleton, SegmentedControl, Pressable
  - `@studio/ui` app components (TransactionRow and AddFab/TabScreen are Finance's, in `apps/finance/src/components/app`):
    - DaySectionHeader, SummaryStrip, ProgressBar
    - Chip, CategoryChip, IconTile, Amount, AmountReadout, Keypad
    - EmptyState, SectionHeader, ListGroup/ListRow
    - UndoToast/`showToast`, FloatingAddButton, HeaderButton, OptionPicker, CurrencyPicker
- **Placement**: feature-specific components live in the app's `src/features/<feature>/`. Only pieces any app could use go in `@studio/ui`.
- **Lists**: `FlashList` (@shopify/flash-list v2) for anything unbounded.
- **Copy**: SPEC §5.10. Terse, sentence case, no instructional text, no emoji, no exclamation marks.

## Header and toolbar controls
- **Text buttons** are plain text on no background. Primary (Done, Save, Edit): `<Button variant="barPrimary">`, `text` colour, semibold. Secondary (Cancel, Reset, Close, Manage): `variant="barSecondary"`, `text-secondary`. Brass is reserved for filled primary buttons and data highlights, never header text. `plainText` is for in-content links only.
- **Icon buttons** use `HeaderButton` (neutral circle).
- **Month control** (`MonthPill`) is `text`-coloured headline text with a small chevron and no pill, like an iOS title menu.
- **Native header items** go through `barLeft(el)` / `barRight(el)` from `@studio/ui` (`unstable_headerLeftItems` / `RightItems` with `hidesSharedBackground: true`), never `headerLeft` / `headerRight`: iOS 26 draws a shared Liquid Glass capsule behind bar items otherwise.

## Sheets and motion
- A scrolling `formSheet` route has the scroll view as its only root: react-native-screens forces the first descendant scroll view to the sheet's full frame, so a toolbar View above it or a footer below blanks content on detent changes. Use `SheetScroll` (`SheetScroll` from `@studio/ui`, toolbar as a sticky header) or a bare `ScrollView`; put actions inside the scroll content. Footers are Android-only (`unstable_sheetFooter`).
- Every navigator, screen and sheet `contentStyle` is `colors.bg`.
- Entrances play once per app session per screen (`claimEntrance` in `@studio/motion`, used by `Stagger`). Never animate on focus (`useIsFocused`): NativeTabs keeps screens mounted, so a focus fade flashes content.

## Web QA
- Web exists only for screenshots. Native-only pieces get `.web.tsx` fallbacks; never degrade native to suit web.
- `pnpm screenshots --app <name>` writes `apps/<name>/.screenshots/<name>-<light|dark>.png` for each route in `apps/<name>/qa/screenshot-routes.json`. Refactors are gated by `tooling/qa/compare-shots.mjs` against a baseline set.
  - `?seed=demo` loads 6 months of demo data.
  - `?seed=empty` gives an onboarded empty state.
  - `"fullPage": true` captures tall pages.
- View the PNGs with the Read tool and iterate until the screen looks like a top-tier iOS app in both light and dark.

## Process
- `pnpm verify` (typecheck, lint, test, iOS bundle for every package and app) must pass. Add unit tests for any new pure logic. After adding a route file, run `pnpm typegen --app <name>` to regenerate typed routes (only `expo start` regenerates them).
- Agents never commit; the orchestrator commits.
- When agents run in parallel, each stays inside the files it was assigned. Shared files (`apps/finance/src/data/actions.ts`, `apps/finance/src/data/hooks/index.ts`, `packages/icons/src/symbolFallbacks.ts`, `apps/finance/qa/screenshot-routes.json`) get small additive `Edit`s only, never a full rewrite.
