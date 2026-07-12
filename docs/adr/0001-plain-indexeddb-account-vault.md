# ADR 0001: Plain IndexedDB account vault

Status: accepted

Multiple AniList accounts are linked locally. Account records and bearer tokens
are stored unencrypted in IndexedDB; account/media preferences use a separate
store keyed by account and media type. Collection contents remain memory-only.

This supports quick switching without introducing a project-operated token
service. Browser encryption without a user-held secret would not protect
against same-origin JavaScript, so the UI and security documentation state the
risk plainly. The token is private to the vault/composition layer. An invalid
token is deleted while its account summary becomes `reauth-required`.
