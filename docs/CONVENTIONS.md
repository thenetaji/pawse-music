# Engineering conventions

Read with `docs/SPEC.md` (what to build) and `docs/DEV.md` (commands). These are binding.

## Environment
- pnpm only; there is no npm/npx (`pnpm exec`, `pnpm dlx`).
- Expo Go only: a native dependency must appear in `node_modules/expo/bundledNativeModules.json` and be added with `pnpm exec expo install`. Pure-JS libraries are fine.
- The React Compiler is on. Never name a binding `Symbol`, because the compiler emits `Symbol.for`. Lint enforces `react-hooks/set-state-in-effect`.

## Data
- **Reads**: hooks from `@/data/hooks` (`useSettings`, `useSetting(key)` → `[value, set]`, `useAccounts`, `useCategories(kind)`, `usePeriodTransactions(filter)`, `useTransaction(id)`, `useRecentTransactions(n)`, `usePeriodSummary`, `useTitleSuggestions`, `useUpcoming`, `useInsights`, `useBudgets`, `useTodayKey`). Never put raw SQL in screens. A new read gets a new hook file in `src/data/hooks/`.
- **Writes**: always through `useActions()` from `@/data/actions`. It refreshes every live hook. Repos throw `ValidationError` with a typed `.code`.
- `useDb()` is for reads only, inside hooks.
- **Money**: integer minor units everywhere. Format only with `formatMoney` / `formatMoneyForSpeech` from `@/lib/money`, using the `show_decimals` setting in lists. Amounts are never floats.
- **Dates**: `@/lib/dates` (`toDateKey`, `periodFor`, `periodLabel`, `dayLabel`, …), honouring the `week_start` and `month_start` settings.
- **Undo delete**: `const snap = actions.transactions.delete(id)`, then `showToast({ message: 'Deleted', actionLabel: 'Undo', onAction: () => actions.transactions.restore(snap) })`.

## UI
- **Text**: `<Text variant tone numeric>` from `@/components/ui/text`. Variants follow SPEC §5.3; tones are default/secondary/tertiary/accent/income/expense/warning/inverted. Amounts always use `numeric`.
- **Icons**: `SymbolIcon` (SF Symbols on iOS; the MaterialIcons fallback comes from `symbolFallbacks.ts`, so add any new SF name there).
- **Classes**:
  - surfaces: `bg-bg`, `bg-surface`, `bg-elevated`, `bg-fill`, `bg-accent`, `bg-accent-soft`
  - text: `text-foreground`, `text-secondary`, `text-tertiary`, `text-accent`, `text-income`, `text-expense`, `text-warning`
  - category colours: `bg-cat-<key>` (chart data), `bg-cat-<key>-ink` (tile fills); `text-accent` is now `text-accent-text` (brass link colour)
  - alpha colours: `withAlpha(hex, a)` with `useTokens()`
  - hairlines: `StyleSheet.hairlineWidth` with the `separator` token
- **Raw values** (Skia, Reanimated, native props): `useTokens()` from `@/theme/use-tokens`.
- **Haptics**: `haptic(kind)` from `@/theme/haptics`. It is already gated by the Haptics setting.
- **Building blocks**:
  - `@/components/ui`: Button, Input, Card, Separator, Switch, Badge, Skeleton, SegmentedControl, Pressable
  - `@/components/app`:
    - TransactionRow, DaySectionHeader, SummaryStrip, ProgressBar
    - Chip, CategoryChip, IconTile, Amount, AmountReadout, Keypad
    - EmptyState, SectionHeader, ListGroup/ListRow
    - UndoToast/`showToast`, FloatingAddButton/AddFab, HeaderButton, OptionPicker, CurrencyPicker, TabScreen
- **Placement**: feature-specific components live in `src/features/<feature>/`. Only truly shared pieces go in `src/components/app/`.
- **Lists**: `FlashList` (@shopify/flash-list v2) for anything unbounded.
- **Copy**: SPEC §5.10. Terse, sentence case, no instructional text, no emoji, no exclamation marks.

## Header and toolbar controls
- **Text buttons** are plain text on no background. Primary (Done, Save, Edit): `<Button variant="barPrimary">`, `text` colour, semibold. Secondary (Cancel, Reset, Close, Manage): `variant="barSecondary"`, `text-secondary`. Brass is reserved for filled primary buttons and data highlights, never header text. `plainText` is for in-content links only.
- **Icon buttons** use `HeaderButton` (neutral circle).
- **Month control** (`MonthPill`) is `text`-coloured headline text with a small chevron and no pill, like an iOS title menu.
- **Native header items** go through `barLeft(el)` / `barRight(el)` from `@/components/app/header-button` (`unstable_headerLeftItems` / `RightItems` with `hidesSharedBackground: true`), never `headerLeft` / `headerRight`: iOS 26 draws a shared Liquid Glass capsule behind bar items otherwise.

## Sheets and motion
- A scrolling `formSheet` route has the scroll view as its only root: react-native-screens forces the first descendant scroll view to the sheet's full frame, so a toolbar View above it or a footer below blanks content on detent changes. Use `SheetScroll` (`@/components/app/sheet-scroll`, toolbar as a sticky header) or a bare `ScrollView`; put actions inside the scroll content. Footers are Android-only (`unstable_sheetFooter`).
- Every navigator, screen and sheet `contentStyle` is `colors.bg`.
- Entrances play once per app session per screen (`claimEntrance` in `@/motion/session`, used by `Stagger`). Never animate on focus (`useIsFocused`): NativeTabs keeps screens mounted, so a focus fade flashes content.

## Web QA
- Web exists only for screenshots. Native-only pieces get `.web.tsx` fallbacks; never degrade native to suit web.
- `pnpm screenshots` writes `.screenshots/<name>-<light|dark>.png` for each route in `scripts/screenshot-routes.json`.
  - `?seed=demo` loads 6 months of demo data.
  - `?seed=empty` gives an onboarded empty state.
  - `"fullPage": true` captures tall pages.
- View the PNGs with the Read tool and iterate until the screen looks like a top-tier iOS app in both light and dark.

## Process
- `pnpm verify` (typecheck, lint, test, iOS bundle) must pass. Add unit tests for any new pure logic. After adding a route file, run `pnpm typegen` to regenerate typed routes (only `expo start` regenerates them).
- Agents never commit; the orchestrator commits.
- When agents run in parallel, each stays inside the files it was assigned. Shared files (`src/data/actions.ts`, `src/data/hooks/index.ts`, `symbolFallbacks.ts`, `scripts/screenshot-routes.json`) get small additive `Edit`s only, never a full rewrite.
