# myAvailable

A personal statement-based money review app built with Angular, Tailwind and daisyUI.

## Run locally

```sh
npm install
npm start
```

Open http://localhost:4200. A new browser profile starts at Welcome → local profile setup → Statements. Returning visitors go to their dashboard. Edit the saved name and focus from Profile.

```sh
npm run build
npm test -- --watch=false
```

## Current milestone: local statement analysis

- Welcome, local profile setup, and the statement inbox use the existing light/dark glass styling.
- PDF, CSV and XLSX statements can be saved, analysed, reviewed and confirmed. Confirmed transactions populate the dashboard, transactions and reports, and survive reloads.
- Analysis is local extraction plus category rules, simulating an AI-assisted workflow. No AI endpoint or API key is connected, and files stay on this device.
- The adaptive reader searches CSV/XLSX files for transaction tables, understands common heading synonyms and two-line headings, and offers manual column mapping when the layout remains ambiguous. Searchable PDFs use provider adapters plus a semantic table reader; scans still need OCR.
- Review amounts, fees, dates, descriptions and categories before confirming. Multiple currencies are supported, with one currency per account.
- Duplicate files and overlapping provider transaction IDs are handled; ambiguous overlaps without IDs are blocked. Removing a source also updates financial totals.
- Profile setup is not authentication. There is no password, cloud synchronization or online account yet. Keep original files: clearing site data removes local records.
- See [statement analysis details](docs/statement-analysis.md) for supported formats, limitations and the lightweight backend direction.

## Structure

- `src/pages/`: routed screens (separate TS, HTML and CSS files).
- `src/components/`: reusable UI, including `empty-state` and `statement-upload`.
- `src/services/`: local onboarding, statement storage, finance calculations and theme.
- `src/environments/environment.ts`: public configuration and file limits. Never store secrets here.
- `docs/mvp-direction.md`: proposed longer-term product direction.

## Next milestone

Add local OCR for scanned statements, extend the guided mapping fallback to spatial PDF columns, and collect consent-based format fingerprints during beta testing. Keep all API credentials on the server if a hosted model is introduced later.

## Verification

Run `npm run build` and `npm test -- --watch=false`. The test suite covers onboarding, storage, parsing, review confirmation, ledger totals, overlaps and source removal. Browser visual verification remains outstanding without a connected browser. The owner starts the development server manually.
