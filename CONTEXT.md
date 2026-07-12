# Domain context

AniList Bulk Edit is an unofficial, browser-only tool for changing one linked
AniList account at a time. These terms are invariants, not loose synonyms.

- **Viewer**: the AniList user returned by the authenticated `Viewer` query.
- **Linked account**: locally stored Viewer metadata plus an AniList bearer
  token. A linked account can require reauthentication while its preferences
  remain available.
- **Active account**: the single linked account whose collection can currently
  be viewed or changed. Commands may never span accounts.
- **Media**: the anime or manga work. Its `id` is a **media ID** and its title,
  cover, format, genres, and release data are immutable workspace metadata.
- **List entry**: the Viewer-specific record for a media item. Its `id` is a
  **list-entry ID**. Mutations do not consistently accept the same kind of ID.
- **Collection**: the canonical deduplicated list entries for one active
  account and one media type. AniList can repeat an entry in multiple returned
  sections; the workspace stores it once.
- **Status section**: a grouping derived from the list entry's AniList status.
- **Custom-list membership**: named Viewer-defined booleans that are separate
  from statuses. Names are private and must not enter analytics or logs.
- **Edit intent**: explicit unchanged/set values captured when a user submits
  an edit. Zero and an empty string are valid values.
- **Bulk job**: a frozen account, media type, entry-ID set, and edit intent,
  executed through the AniList gateway and scheduler.
- **Confirmed patch**: mutable fields whose upstream result was acknowledged
  or verified. Its media type comes from the command key, never a sparse
  mutation response.
- **Reconciliation**: one atomic terminal workspace commit of confirmed
  patches and deletions, preserving complete media metadata.
- **Per-entry outcome**: confirmed success, classified failure, unattempted
  cancellation, or unknown/ambiguous execution requiring targeted verify.

The dependency direction is:

`Account manager -> AniList gateway -> Bulk job -> Media-list workspace -> Derived view`
