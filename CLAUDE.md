# myAvailable — CLAUDE.md

Personal finance app for Ghana. Users import MoMo (MTN, Telecel) and bank statements (PDF or CSV). The app reads them **on the device**, categorises every transaction and fills a dashboard. Money is GHS only.

**Product principles. Don't trade these away:**
- **Privacy.** Statements and PDF passwords never leave the browser. No AI service and no backend yet. Never store a password, never log statement contents, never add analytics that send transaction data.
- **Never guess silently.** Refuse rather than import wrong money: wrapped amounts, unknown layouts, ambiguous overlaps. The running-balance check decides whether an import is trusted (see Statement pipeline).
- **Built for Ghana.** MoMo first, many wallets, small daily payments, airtime, betting, quick loans (QwikLoan, Fido) and fees. Wording is plain English for non-experts.

## Commands

```sh
npm start                       # dev server on http://localhost:4200 (restart after angular.json changes)
npx ng build                    # production build; component CSS budget errors show up here
npx ng test --watch=false       # Vitest unit tests (jsdom + fake-indexeddb)
```

Run the build and the tests before calling anything done.

## Stack and conventions

- Angular 21: standalone components, **signals** (`signal`, `computed`, `linkedSignal`, `input`, `output`), new control flow (`@if`, `@for`, `@switch`). No NgModules, no RxJS for state.
- Each routed page and component has separate `.ts`, `.html` and `.css` files. Component CSS budget: warning at 4 kB, error at 12 kB (`angular.json`).
- Tailwind v4 (via `.postcssrc.json`) plus daisyUI 5. Two custom themes live in `src/styles.css`. Built-in daisyUI themes are disabled.
- Money is stored as **integer pesewas** (`amountMinor`) in analysis drafts, and as cedis (`number`) in `Transaction`. Format money only with `MoneyPipe` / `formatMoney` (`src/shared/money.ts`) and animate numbers with the `CountUp` directive. Never hand-format "GH₵".
- Icons: 24×24 stroke paths in `src/shared/icons.ts`, drawn with `<app-icon [path]="icons.x" class="size-4" />`. Category icons live in `src/data/categories.ts`.
- Persistence: statements and confirmed drafts in IndexedDB (`mysika` database, `statements` store); the profile in `localStorage['mysika.profile.v1']`; the theme in `localStorage['theme']`; budgets, goals, transfer decisions and category corrections/rules in localStorage.
- `src/environments/environment.ts` is public config (file limits: 25 MB, 400 pages). Never put secrets there.

## Architecture: from file to dashboard

```
StatementUpload ──▶ Statements.importFile()               src/services/statements/statements.ts
                      save (SHA-256 dedupe) → analyse → paced loader stages → confirm → /home
                      outcomes: imported | review | password | error
LocalStatementAnalyser (STATEMENT_ANALYSER token)          src/services/analysis/statement-analyser.ts
  CSV → parseCsv          PDF → pdf.js LEGACY build → PdfCell[][] (rotated watermark text dropped)
pdfTable(pages)                                            src/services/analysis/pdf-table.ts
  momoPdfTable() first (MTN MoMo ten-column export)       momo-pdf.ts
  otherwise the generic layout engine (bank tables)
rowsToDraft(table, text, meta)                             parse-statement.ts
  validation, categoryFor(), checkBalances() → AnalysisDraft
ledgerTransactions(confirmed drafts) → Finance signals     ledger.ts, src/services/finance/finance.ts
```

- `Finance` (root) derives everything (totals, categories, insights, ranges) from `Statements.confirmed()`. Pages read `Finance`. Never keep a separate copy of the data.
- `ImportLoader` (`src/components/import-loader/`) is the full-screen animation. Stages: reading → extracting → sorting → building → done. They are deliberately paced in `runImport` (`pause()` calls) and show real numbers from `importSummary`.
- `StatementReview` only appears when something needs a person: no account label, a clash with earlier imports, or more than 5% of balances broken.
- Password-protected PDFs: `PasswordRequiredError` sets `passwordRequest`, the Statements page shows the unlock dialog, then `unlock(id, password)` runs. The password is passed straight to pdf.js and dropped.
- Encrypted backup lives in `src/services/backup/backup.ts`. It serializes statement Blobs plus the allow-listed local settings, derives an AES-256-GCM key with PBKDF2-SHA-256 (310,000 iterations), and validates the full decrypted payload before replacing data. Backup passwords are never stored. Restore rolls back if applying local settings fails.
- Public trust routes live at `/help`, `/privacy` and `/terms`. The Help page is the source of truth for user-facing format support and troubleshooting. Keep unsupported providers explicit, never ask users to attach statements to a public support report, and keep `environment.appVersion` aligned with `package.json`.
- Production builds generate Angular's service worker from `ngsw-config.json`. The application shell is prefetched; statement tools cache after use. Update notices reload the whole page only after `VERSION_READY` to avoid mixing old and new lazy chunks. Cloudflare security/cache headers live in `public/_headers`; SPA fallback is configured only in `wrangler.jsonc`. Do not add a catch-all `_redirects` rewrite alongside Wrangler's `single-page-application` handling—it creates an `/index.html` loop during Workers deployment.

## Statement pipeline: rules learned the hard way

- **Use `pdfjs-dist/legacy/build/pdf.mjs`**, and copy the worker from `legacy/build` (`angular.json` assets). The default v6 build crashes on Chrome < 140 and many phones (`Uint8Array#toHex`, `Math.sumPrecise`). Keep the import and the worker from the same build.
- **The generic engine is the default for new providers. Avoid one-off parsers.** It:
  - detects the header row by aliases (`aliases` in `parse-statement.ts`; add new bank header words there);
  - treats unknown or ignored headers (`Value Date`, `Cheque Number`) as column boundaries;
  - assigns text to columns by centre position;
  - follows rows that wrap over several lines and across pages;
  - skips summary lines (`Balance B/F`, `Total`);
  - stops at footers.
  Write a provider-specific parser (like `momo-pdf.ts`) only when the layout genuinely isn't a table.
- **Wrapped text** is rebuilt by `rebuild()`. A single-token fragment as wide as the column's widest fragment is glued to the next one ("21538386000" + "01"). Banks wrap at spaces when they can.
- **Safety:** an amount on a continuation line throws. Never relax that to "make a file work". Find the real cause instead.
- **Dates:** `parseDate` accepts ISO, `DD/MM/YYYY`, named months (`12 JAN 26`, `3-Sept-2026`) and AM/PM. It rejects rollover dates. **Money:** `moneyMinor` accepts thousands separators, `(1.00)` and a `CR`/`DR` suffix, with at most 2 decimals.
- **Running balance is the trust signal.** `checkBalances` tests each pair: new balance = previous balance + amount − fee, oldest-first or newest-first. Up to 5% broken is allowed, because real MoMo quirks exist (airtime bought on credit shows balance 0). Above that, the import goes to review. A correct bank import should have **0 breaks**, and its credit and debit totals should match the statement header to the pesewa.
- **Same-date ties** (banks print no times) are ordered by statement order in `ledgerTransactions`, so "latest balance" equals the closing balance.
- **Categorisation:** `categoryFor(name, detail, amount, owner)` in order:
  1. loans;
  2. own transfers (the counterparty mentions ≥2 of the account holder's names; incoming → `from-bank`, outgoing → `own-accounts`);
  3. `received` for anything positive;
  4. keyword `RULES` (charges first);
  5. `transfers` as the fallback.

  Add keywords from real statements and add a test for each.
- **User category corrections never rewrite the confirmed draft.** `category-corrections.ts` overlays an exact transaction correction first, then a same-counterparty/same-direction rule. Confirmed cross-account transfer matches win last. Removing an overlay restores the statement suggestion.
- Rows with no narrative (month-end interest) become "Bank credit" or "Bank debit". Don't reject them.
- Account label: MoMo gives `MTN MoMo ••1234`; banks give `<Bank> ••1234`, with the bank name from the `BANKS` list in `pdf-table.ts`.
- **Multiple accounts can coexist.** `Transaction.accountKey` keeps provider IDs and balances scoped to their source account. `findTransferCandidates` pairs exact-value, nearby, cross-account rows only when both select each other as the nearest counterpart. Strong unique pairs are automatic; uncertain pairs require confirmation. "All accounts" unlocks after pending pairs are handled and sums each account's latest known balance.

## UI design system (read before any UI work)

The look follows a reference design: **soft, warm, glassy, rounded, calm**. Light = translucent cream cards on warm greige with yellow glows. Dark = true black with smoked-glass cards. Yellow (`#f4c93b`) is the single brand accent.

**Use tokens and existing classes. Never hard-code colours.** Everything is defined in `src/styles.css`:

| Need | Use |
|---|---|
| Card / panel | `.panel` (or `glass-surface rounded-box p-5`), plus `.panel-hover` for lift on hover |
| Highlight card (balance hero, welcome) | `.feature-card`: yellow→cream glass in light, black glass with a gold glow in dark |
| Pill or circle on a feature card | `.feature-soft` |
| Inner tile on a card (stats, insights) | `.tile` (control material: `--control-fill`, `--control-edge`, `--control-shadow`) |
| Icon in a soft circle | `.icon-chip` + a tint like `bg-primary/15`, with `<app-icon>` inside |
| Small label | `.chip` · segmented buttons: `.seg > button[aria-pressed]` |
| Panel heading | `.panel-title` |
| Entrance motion | `.reveal` with `style="--i: n"` for stagger; `.grow-y`, `.grow-x`, `.fade-in` |
| Inputs | daisyUI `input` / `select` (already restyled to the control material) |
| Buttons | `btn btn-primary rounded-full` (main action), `btn btn-ghost rounded-full`, `btn-neutral` |

- **Text:** use `text-base-content` with opacity steps (`/70`, `/60`, `/50`). Never `text-white` or `text-black`. Feature cards inherit theme ink.
- **Colours:** use daisyUI semantic colours (`primary`, `success` = money in, `error` = money out, `warning`, `info`) and `--series-1…6` **only for chart series**. Colour-blind-safe category order is defined there.
- **Base colours:** light `base-100 #fbf8f2` (soft white, never `#fff`), `base-200 #ebe6dc` page; dark `base-100 #121212`, `base-200 #000`.
- **New surfaces** use `var(--glass-*)`, `var(--control-*)` or `var(--feature-*)`, never one-off rgba values. If a new material is needed, add a token to both themes (`:root` and `[data-theme='finance-dark']`).
- **Shape:** generous radii (`rounded-box` = 1.25rem, `rounded-2xl`, `rounded-full` for buttons, pills and icon circles). Thin 1.8 px stroke icons.
- **Navigation:** the active tab is a yellow pill (`.nav-tab-active`).
- **Overlays** (loader, unlock dialog): fixed full-screen backdrop `color-mix(base-200 72%)` with `backdrop-filter: blur(14px)`, a glass card, and spring-in animation (`cubic-bezier(.2,.9,.3,1.2)`).
- **Always:**
  - check **both themes**;
  - check **phone width (375 px) with no horizontal scroll**;
  - provide `prefers-reduced-motion` fallbacks for new animations;
  - add `aria-label`s on icon-only buttons and `role="status"` / `aria-live` for progress;
  - set `role="dialog"` with `aria-modal` on overlays.
- The `prefers-reduced-transparency` and `prefers-contrast` media queries already swap glass for solid surfaces. Keep new glass on the shared tokens so this keeps working.
- **Charts** (`src/components/charts/`) are hand-built SVG components. Long ranges group automatically (daily ≤45 days, weekly ≤120, monthly beyond).
- **Copy:** short and friendly, in plain words a non-finance person understands. Say what happened and what to do next. Show real numbers from the user's data, never invented sample figures.

## Verifying changes

- **Parser changes:** add a Vitest case.
  - The PDF fixtures in `bank-pdf.spec.ts` and `momo-pdf.spec.ts` are `PdfCell[]` arrays modelled on real layouts.
  - For a real file, extract cells in Node with `pdfjs-dist/legacy/build/pdf.mjs`, using the same filter and mapping as `statement-analyser.ts`, then run `pdfTable` → `rowsToDraft` (bundle with `node_modules/.bin/esbuild`).
  - Check row count, `balanceCheck.breaks === 0` and that totals equal the statement's header.
- **UI and flow changes:** serve `dist/my-finance-manager/browser` with an SPA fallback. Drive it with Playwright using Chrome (`channel: 'chrome'`). Seed `localStorage['mysika.profile.v1']` to skip onboarding, and `localStorage['theme']` (`finance` or `finance-dark`). Screenshot both themes and phone width.
- **Real statements are personal data.** Process them only locally. Put working copies and extracted JSON in the scratchpad and delete them afterwards. Never commit them, and never write account numbers, names or passwords into code, tests, docs or commit messages. Fixtures must be synthetic.

## Known gaps and roadmap

1. Readers for Telecel Cash and AT Money, and validation against more real bank layouts (GCB, Ecobank, Fidelity…).
2. OCR for scanned PDFs, and an optional, consented AI fallback whose output is checked by the running balance.
3. Optional encrypted cross-device sync, an installable app (PWA), and monthly summaries.
4. Insights: fee leak, loan churn, net betting, money sent to people, round trips.

`README.md` and `docs/statement-analysis.md` predate the layout engine, password support and one-step import. Where they disagree, trust this file and the code, and update them when you touch those areas.
