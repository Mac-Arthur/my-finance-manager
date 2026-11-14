# Statement analysis milestone

## What is implemented

Statements → Analyse statement → Review results → Confirm & open dashboard.

The app reads actual file contents locally. This is a prototype of an AI-assisted workflow using deterministic extraction and category rules, not a remote AI model and not fabricated sample output. `STATEMENT_ANALYSER` is the replaceable engine boundary; `LocalStatementAnalyser` is the current provider.

Confirmed drafts are persisted with their source statement in IndexedDB. Finance derives one shared ledger from confirmed imports, including after reload. Unconfirmed or failed drafts never contribute to totals. Removing a confirmed statement also removes its contribution, while transactions backed by another confirmed statement remain.

## Supported inputs

- CSV: `date,name,amount` are required; optional `fee,balance,transaction_id,reference,currency`. Alternatively use `debit,credit` instead of a signed amount. Debit and credit values must be non-negative. Positive signed amounts mean incoming money.
- Dates: `YYYY-MM-DD` or explicit day-first `DD/MM/YYYY`, optionally followed by `HH:mm:ss`. No ambiguous runtime date parsing.
- Money: decimal point with at most two digits; optional comma thousands separators. Values are stored in integer pesewas in drafts. Only GHS is supported.
- PDFs: searchable text tables with recognisable date, description/name, signed amount (or debit and credit) headers. Optional fee, balance and transaction ID columns are supported. Headers must repeat on each transaction page. Extraction groups text by page coordinates.
- Scans, password-protected files, wrapped monetary rows, unrecognised headers and malformed data produce errors. OCR and unrestricted document understanding are not implemented. Do not claim support for a provider's exact layout until a real sample has been verified.

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

Unit tests cover parsing, money/date validation, reconstructed PDF tables, overlapping imports, the confirmation gate, persistence and source removal. A generated two-page PDF was extracted using PDF.js, its exact two transaction amounts and fee were checked, and both rendered pages were inspected. The user's real statement layout and browser end-to-end flow still need verification. No development server was started.

Implementation references: [PDF.js examples](https://mozilla.github.io/pdf.js/examples/) and [Papa Parse documentation](https://www.papaparse.com/docs).
