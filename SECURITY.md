# Security policy

## Credential model

AniList bearer tokens are stored unencrypted in IndexedDB in the browser that
linked them. They are never intentionally copied to cookies or localStorage and
are sent only to `https://graphql.anilist.co` in the `Authorization` header.
The application has no server-side token vault.

This is a deliberate usability tradeoff, not encryption: JavaScript executing
on the same origin can read IndexedDB. AniList tokens have broad account access,
so an XSS or compromised same-origin dependency could steal them. Users should
remove a locally linked account when they no longer use the tool and can manage
AniList application grants in [AniList developer settings](https://anilist.co/settings/developer).

Mitigations include a nonce-based Content Security Policy, narrow connection
and image origins, no arbitrary same-origin GraphQL proxy, dependency auditing,
and strict rules against sensitive logs or analytics. Local removal cannot
revoke an upstream grant.

## Analytics

Vercel Analytics receives only redacted paths. Query strings and fragments are
removed. Product events, when present, are aggregate buckets only and exclude
accounts, media, titles, notes, and custom-list names.

## Reporting a vulnerability

Please avoid opening a public issue for an unpatched vulnerability. Use the
repository owner's private GitHub contact or GitHub's private vulnerability
reporting feature at
[Ari-03/Anilist-Bluk-Edit](https://github.com/Ari-03/Anilist-Bluk-Edit/security).
Include reproduction steps and impact, but never include a live AniList token.
