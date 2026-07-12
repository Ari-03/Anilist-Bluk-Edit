# ADR 0004: Bulk partial-success and cancellation semantics

Status: accepted

A submitted job freezes its account, media type, entry IDs, and explicit edit
intent. Alias-level GraphQL data is retained even when sibling aliases fail.
Only confirmed patches/deletions are committed; missing response IDs are not
successes.

Cancellation stops new scheduling and lets an in-flight mutation settle.
Failed and unattempted IDs stay selected with the form intact. Connection loss
after a mutation is ambiguous: the mutation is not retried automatically and a
targeted entry read verifies it when possible.

If targeted verification confirms that the token itself is invalid, reconnect
uses AniList's external OAuth navigation. That new document has no in-memory
workspace snapshot, so the callback's return to `/` must complete an
authoritative collection load before another edit can be started. This reload
is the safety boundary for the otherwise React-local ambiguity state.
