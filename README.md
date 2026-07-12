# AniList Bulk Edit

AniList Bulk Edit is an unofficial third-party browser tool for filtering and
editing many anime or manga list entries at once. It supports multiple locally
linked accounts while keeping every view and operation scoped to one active
account.

## What it does

- Links AniList accounts through the browser OAuth implicit flow.
- Filters by status, custom list, format, genre, country, year, score, and title.
- Sorts and paginates large collections without mutating source data.
- Applies status, score, progress, privacy, hidden, note, and custom-list edits.
- Reports per-entry partial failures and supports cancellation/retry.
- Reconciles confirmed changes locally without a blocking collection reload.
- Discovers same-type prequel/sequel chains and previews proposed completions.
- Supports keyboard selection, reduced motion, mobile filters, and dark mode.

## Credential and privacy model

Linked AniList tokens are stored unencrypted in IndexedDB in this browser. They
are accessible to JavaScript running on this site. Tokens are sent only to
`https://graphql.anilist.co` in the `Authorization` header; the project does not
operate a token proxy or server-side vault. Removing a linked account clears the
local token but does not revoke the AniList grant.

Vercel Analytics is enabled with query strings and fragments removed. Account
IDs, media IDs, titles, notes, tokens, and custom-list names are excluded. See
[SECURITY.md](SECURITY.md) for the full tradeoff.

## Local development

Requirements:

- Node.js 24
- An AniList OAuth client whose redirect URL is
  `http://localhost:3000/auth/callback`

```sh
git clone https://github.com/Ari-03/Anilist-Bluk-Edit.git
cd Anilist-Bluk-Edit
cp .env.example .env.local
npm ci
npm run dev
```

Set the single public OAuth client identifier in `.env.local`:

```dotenv
NEXT_PUBLIC_ANILIST_CLIENT_ID=your_client_id
```

Open <http://localhost:3000>. No real token is needed for automated tests.

## Quality commands

```sh
npm run lint
npm run type-check
npm test
npm run test:coverage
npm run test:e2e
npm run audit:production
npm run build
npm run check:bundle
npm run test:lighthouse
```

`check:bundle` uses the existing production build and Playwright Chromium to
measure a mocked linked-account boot. `test:lighthouse` uses the same build and
browser.

## Architecture

The application remains on the Next.js Pages Router. Its deep modules have
small test seams:

```text
Account manager -> AniList gateway -> Bulk-edit job
                                      |
                                      v
                     Media-list workspace -> Derived view
```

The account vault is the only credential store. The gateway owns GraphQL and
AniList ID conventions. Bulk jobs own batching, progress, cancellation, and
per-entry outcomes. The workspace owns canonical collections and sparse-patch
reconciliation; list queries own immutable derived projections.

Read [CONTEXT.md](CONTEXT.md), [AGENTS.md](AGENTS.md), and
[docs/adr](docs/adr) before changing a boundary.

## Deployment

Configure `NEXT_PUBLIC_ANILIST_CLIENT_ID` and register the deployed
`/auth/callback` URL in the same AniList OAuth client. The app can be deployed as
a normal Next.js 16 project. HTTPS is required for production use.

## Support and license

Report bugs in [GitHub Issues](https://github.com/Ari-03/Anilist-Bluk-Edit/issues).
Please use private vulnerability reporting for security issues.

MIT licensed, copyright 2025–2026 Ari-03. AniList Bulk Edit is not affiliated
with or endorsed by AniList.
