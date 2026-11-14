# myAvailable: statement-based monthly money review

Status: proposed product direction following repository review, 13 November 2026. This document describes planned behavior, not features already implemented.

## Product promise

Turn statements into a trustworthy monthly history that explains where money went, what changed, and whether a chosen spending habit improved.

Primary user: the owner of this app, initially using one MTN MoMo wallet in GHS. Start with three months of real history. Preserve every imported year and month; three months is a view, not a retention limit.

## Current implementation

- Angular standalone pages, signals, charts, theme switching and responsive navigation.
- Finance service computes totals, category breakdowns and rule-based insights from manually transcribed sample transactions.
- The sample covers 27 October–6 November 2026. No PDF parser, file upload flow, transaction database or server is implemented.
- Budgets and a goal use localStorage. Transactions reset from source data.
- Home has its own Finance instance and date selection; Reports and Transactions use the root instance. A real import must update shared data across all pages.
- Categorization relies partly on synthetic ME:, BANK: and LOAN: prefixes. Real statements need provider-specific parsing and user-confirmed account ownership.
- Transaction IDs depend on row position, so they cannot safely identify duplicate imports.
- The spend trend compares halves of one period, not months. Some insight text makes unsupported causal claims.
- Settings, Profile and Notifications have placeholder behavior. The notification badge is hardcoded.

## Recurring workflow

1. Upload one statement covering three months, or separate statements covering those months.
2. Identify provider, account, currency and actual coverage from the document. Let the user confirm account identity.
3. Extract rows into a draft. Show dates, money in/out, fees, transaction count, parsing warnings and balance reconciliation where possible.
4. Review ambiguous rows and potential duplicates. Never silently discard unreadable money rows.
5. Confirm import. Save the statement metadata, source associations and normalized transactions atomically.
6. Recompute dashboard, transaction search, monthly history and comparisons from that shared ledger.
7. Correct categories in Transactions. Offer to remember an explicit rule for future transactions without assuming every payment to the same person has the same purpose.
8. Choose one monthly action and review the actual result after the next upload.

Monthly uploads are sufficient for retrospective reviews. Mid-month uploads are optional and may overlap previous files. This is not live account monitoring: show the latest covered date prominently.

## Pages

| Page | Purpose |
| --- | --- |
| Dashboard | Selected period summary, three-month context, latest five transactions, evidence-backed insights, data freshness and upload action. |
| Statements | Upload and review workflow; library of imports; account, coverage, status, errors and safe removal of an import. |
| Transactions | Search, filter, inspect original source, correct category, confirm own transfers and review uncertain classifications. |
| Trends | Evolve Reports into monthly/yearly history, month comparisons, category changes and drill-down to contributing transactions. |
| Settings | Account labels, own-account identification, category rules, export/restore, theme and data management. |

Keep Budgets accessible but secondary until monthly records are reliable. Keep the dashboard free of the budgets section as requested. Hide unfinished Profile and fake notification indicators from the core workflow.

## Calendar behavior

- Initial view: latest three calendar months ending with the latest imported month; display exact month names. Existing data today corresponds to September–November 2026, with September missing and October/November partial.
- Explicit shortcuts: This month, Last month, Last 3 months, and month/year navigation. Calendar shortcuts use today's date and never silently substitute a different month.
- Remember an explicit selection. After later imports, offer to open the newly imported period.
- Derive monthly records from transaction dates. A cross-month statement populates multiple months without splitting the original document.
- Track coverage intervals per account. A month is complete only when its full date range is covered for the accounts included in the view.
- Show missing, partial and complete coverage; an absent statement is not zero spending.
- Compare complete months directly. Compare a current partial month with the equivalent covered dates in the prior month only when both have coverage. Otherwise show the mismatch and suppress headline percentage conclusions.
- Missing baseline means comparison unavailable; a zero baseline with positive current spending means newly observed spending, not infinite percentage growth.

## Trustworthy accounting

- Separate money movement from income and consumption. A bank transfer may be an own-account transfer; ask rather than assume.
- Show borrowing separately from income. Show repayments separately from ordinary purchases.
- Cash withdrawals are movement into cash with unknown downstream use, not a known shopping category.
- Avoid counting both sides of an own-account transfer as income/spending. Fees still count as costs.
- Label unknown person-to-person payments as needing classification rather than inventing a purpose.
- Store money in integer pesewas and currency explicitly.
- Label balances with their account and statement timestamp. Never imply that an imported balance is live or a complete view of available funds.
- Do not infer savings from wallet-to-wallet transfers, cash-flow surplus, or manually entered goal progress.
- Replace causal loan claims with observed borrowing/repayment totals. Estimates and what-if scenarios must be clearly separate from observed results.
- Every insight links to its period and contributing transactions. Correcting data must update it.

## Import boundaries

Support the user's actual MTN MoMo text-based PDF format first, plus a documented CSV fallback. Obtain a representative PDF to validate extraction; the existing sample rows do not describe its layout.

Detect unsupported documents and scanned pages explicitly. Explain when a searchable PDF/CSV is needed. Password-protected files should either have an explicit supported unlock flow or a clear unsupported-file message; do not pretend extraction succeeded.

Prefer provider transaction IDs scoped to account. Use file hashes to recognize repeat files. When transaction IDs are absent, use normalized fields to identify candidate overlaps and preserve multiplicity: two genuine identical payments must not be collapsed automatically. Ambiguous matches require review.

Use opening/closing balances and provider-specific fee semantics to reconcile where available. Reconciliation failures block a clean/verified status and require review. Retain extraction provenance and parser version.

Removing an import removes its source associations, not transactions still supported by another retained import. Preserve user corrections across re-imports.

## Data architecture

- Account: provider, user label, currency, confirmed ownership.
- StatementImport: file fingerprint, account, coverage intervals, reported balances, parser version, import state and diagnostics.
- Transaction: stable identity, provider ID if available, date/time, signed amount, fee, reported balance, raw description/reference and source links.
- Classification: category, movement type, review status, user override and matching rule.
- MonthlyAction: selected category/behavior, target month, baseline and measured outcome.

Use one persistent ledger shared by every route. Keep period selection separate from stored transactions. Compute monthly summaries from that ledger; do not maintain disconnected monthly copies.

For a first personal version, use browser-local IndexedDB with export and restore. State clearly that data belongs to this browser/device and clearing site data can remove it. Backups are part of this version, not an optional future feature. Cloud accounts and synchronization can follow after the import/review loop proves useful.

Keep raw PDFs on-device if retained, document retention behavior, and provide deletion. Do not upload statement contents to an external AI service implicitly. Deterministic arithmetic remains authoritative even if AI-assisted extraction or explanations are added later.

## Delivery sequence and acceptance gates

1. Shared persistent ledger, real empty/demo states, calendar coverage and export/restore. Reloading retains records; all routes agree on totals.
2. Statements upload, draft review, validated MTN parser, duplicate handling and provenance. Re-importing the same file adds zero transactions; legitimate repeated payments survive; failed parsing cannot silently publish partial totals.
3. Monthly history and Trends. Cross-month and cross-year imports work; incomplete months are visible; comparable-period totals match transaction drill-downs.
4. Useful insights and one monthly action. Category edits update all views; factual observations stay separate from estimates; the next month's import evaluates the action.

The first complete MVP includes all four slices. Initial parser validation requires a representative real PDF. No production PDF-support claim until that path has been verified end to end.

## Success criteria

- Import and review a routine monthly statement in a few minutes.
- Trust every total enough to trace it back to source transactions.
- Answer: where did money go, what changed, and which behavior will I try to improve?
- Return for the following month's review and evaluate the previous action.

Later opportunities: more statement providers, optional cash entries, recurring-payment detection with user confirmation, household/shared views, cloud backup and sync, and natural-language questions grounded in the ledger. Build these after the core workflow is dependable.
