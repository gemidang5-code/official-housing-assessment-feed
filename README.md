# Official housing assessment feed

Only official public data and reproducible preprocessing live here. No customer records, company application source, PDFs, credentials, or API keys belong in this repository.

## Source and coverage

National Ministry of Land, Infrastructure and Transport collective-housing assessed prices: https://www.data.go.kr/data/3073746/fileData.do . The source is free and marked unrestricted use. Source attribution and the full original CSV SHA-256, row count, base date and derivative checksum accompany every release.

This dataset covers collective housing. It is not a KB market price, actual transaction price, detached-house assessment dataset, or lending valuation. Unsupported parcels and records without a valid identifying price are not fabricated. Consumers must match the exact parcel, building/unit and exclusive area; ambiguous matches must remain unresolved.

## Automatic update

The standard GitHub-hosted Ubuntu runner checks the official public source monthly and on source changes. It refuses to run in a private repository. No paid plan, portal login, stored customer credential or customer-specific query is used. If the official portal adds CAPTCHA or changes its layout, the job fails without bypassing it, and the last verified release remains available.

The full original CSV checksum and row count must match before an index is published. Release tag: `official-assessment-index`. The immutable binary is uploaded before `current.json`. Consumers download the whole-country binary rather than transmitting customer addresses to GitHub.

`official-assessment-source-check.json` on the `codex/official-assessment-feed` branch records actual monthly source checks. Scheduled execution remains subject to GitHub availability and platform policies; failures are visible in Actions. No permanent-availability guarantee is made.

## Run

Node.js 24. `node scripts/build-assessment-index.mjs source.zip outputs/index` builds and verifies an index. GitHub Actions invokes `scripts/refresh-assessment-feed.mjs` with its short-lived built-in workflow token solely to publish public release assets and the source-check record.

Data rights follow the linked official source; no additional proprietary claim is made over public source records.
