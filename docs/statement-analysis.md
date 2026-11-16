# Statement analysis milestone

## What is implemented

Statements → Analyse statement → Review results → Confirm & open dashboard.

The app reads actual file contents locally. This is a prototype of an AI-assisted workflow using deterministic extraction and category rules, not a remote AI model and not fabricated sample output. `STATEMENT_ANALYSER` is the replaceable engine boundary; `LocalStatementAnalyser` is the current provider.

Confirmed drafts are persisted with their source statement in IndexedDB. Finance derives one shared ledger from confirmed imports, including after reload. Unconfirmed or failed drafts never contribute to totals. Removing a confirmed statement also removes its contribution, while transactions backed by another confirmed statement remain.

## Supported inputs

- CSV: the reader searches the first 100 rows for a transaction table, accepts common provider synonyms, combines two-line headings, and can infer unfamiliar date/description/single signed-amount columns from strongly typed values. Alternatively use separate non-negative debit and credit columns.
- XLSX: the same adaptive table reader is used for ordinary Excel workbooks. Hidden sheets are ignored and visible sheets are combined only when their transaction schemas match.
- Recovery: if a CSV/XLSX table is visible but debit, credit or other headings remain ambiguous, the app shows a local column-mapping preview. The user identifies Date, Description and Amount (or Debit and Credit), then reviews every extracted transaction.
- Dates: `YYYY-MM-DD` or explicit day-first `DD/MM/YYYY`, optionally followed by `HH:mm:ss`. No ambiguous runtime date parsing.
- Money: decimal point with at most two digits; optional comma thousands separators. Values are stored in integer minor units. GHS, USD, GBP, EUR, CAD, AUD, NGN, KES and ZAR are supported, one currency per account.
- PDFs: searchable text tables with semantic date, description/name, signed amount (or debit and credit) headings. Known-provider adapters accelerate difficult layouts, while the generic reader recognises broader heading vocabulary and reconstructs wrapped cells by page coordinates.
- Scans and layouts whose direction or row boundaries cannot be proven still produce errors. Password-protected PDFs can be unlocked locally. OCR is not implemented. The reader refuses equally plausible interpretations and any amount-bearing row without a valid date rather than silently dropping or reversing money.

The downloadable CSV column template is at `public/templates/statement.csv`. The PDF in `src/services/analysis/fixtures/text-table.pdf` is clearly synthetic test data and never loaded into the production app.

## Review and data integrity

- Check every row against the original. Amounts, dates, descriptions, fees, balances and categories are editable before confirming.
- An account label is required. This prototype supports one wallet at a time, avoiding misleading merged balance graphs.
- Exact repeat files are detected by SHA-256.
- Provider transaction IDs are scoped to the account. Matching IDs with matching dates/amounts/fees/balances are counted once. Conflicting IDs block confirmation.
- Overlapping date ranges without provider IDs block confirmation rather than guessing which payments are duplicates. Repeated legitimate payments inside one file are retained.
- Confirmation validates and writes inside a single IndexedDB transaction to protect against concurrent confirmations in another tab.
- Coverage is inferred from transaction date spans, not authenticated full statement coverage. Gaps between imports are excluded from averages. Partial periods and unknown balances remain labelled.
- No automatic opening/closing balance reconciliation is claimed. Review remains required.
- Categories are rules, not factual conclusions about intent. Mark own-account transfers explicitly. Borrowing is shown separately from ordinary received money where recognized.

## Backend direction

Local parsing and this simulated workflow do not need a backend. For a hosted AI model, add a small server/serverless endpoint that holds the provider credential and returns the same draft contract. Keep credentials out of Angular environment files. Add explicit disclosure before any statement leaves the device, authenticated access, input limits, structured response validation and deliberate retention rules.

A .NET API is an option, not a requirement. PostgreSQL or Firebase becomes relevant for cloud history, accounts and synchronization; neither is necessary just to call an analysis endpoint. The current local service and draft/review boundary keep that decision separate from the UI.

## Verification and limits

Unit tests cover adaptive schema inference, two-line headings, manual column mapping, money/date validation, reconstructed PDF tables, overlapping imports, the confirmation gate, persistence and source removal. Real MTN transaction-history exports with different internal PDF encodings have also been verified locally. Scanned-document OCR and unrestricted document understanding remain future work.

Implementation references: [PDF.js examples](https://mozilla.github.io/pdf.js/examples/) and [Papa Parse documentation](https://www.papaparse.com/docs).
