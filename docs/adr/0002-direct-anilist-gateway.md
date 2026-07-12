# ADR 0002: Direct AniList gateway

Status: accepted

Browser code calls `https://graphql.anilist.co` directly. The former arbitrary
same-origin GraphQL proxy and token-returning authentication APIs are removed.
AniList supports the browser OAuth implicit grant and cross-origin requests.

One typed gateway owns GraphQL transport, error classification, rate headers,
and AniList's inconsistent mutation ID rules. This narrows credential
destinations and lets deterministic adapters exercise partial and ambiguous
responses without a real token.
