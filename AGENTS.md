# Working in this repository

Use Node.js 24 (`.nvmrc`) and npm.

```sh
npm ci
npm run lint
npm run type-check
npm test
npm run test:coverage
npm run build
npm run check:bundle
npm run test:e2e
npm run test:lighthouse
npm run audit:production
```

The Pages Router is intentional. Domain code lives under `src/modules`:
accounts own credentials, the AniList gateway owns transport and ID rules,
bulk-edit owns job semantics, and media-list owns canonical state/projections.
React components compose those seams; they must not recreate GraphQL or
reconciliation logic.

Invariants:

- Never log or analyze tokens, account/media IDs, titles, notes, URL
  query/hash values, or custom-list names.
- Tokens may be stored only in the account vault's IndexedDB record and sent
  only in AniList's `Authorization` header.
- A command belongs to exactly one account and media type.
- Never infer media type from a mutation response.
- Never replace full media metadata with a sparse mutation record.
- A successful edit/delete must not fetch `MediaListCollection`.
- Mutation timeouts are ambiguous and are not blindly retried.
- Unknown outcomes remain verification-locked; confirmed-token reauthentication
  is safe only because external OAuth creates a new document and forces a fresh
  collection load before editing resumes.
- Sorting/projection code must not mutate canonical arrays.

Use injected in-memory vaults, deterministic AniList adapters, and a fake
clock/scheduler in tests. Read `CONTEXT.md` and `docs/adr/` before changing a
module boundary. The remaining composition-root extraction is tracked in
`docs/architecture-debt.md`.
