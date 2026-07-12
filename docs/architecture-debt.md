# Architecture follow-ups

The modernization establishes tested account, AniList, bulk-job, workspace,
query, and related-discovery boundaries. One composition hotspot remains:
`WorkspaceApplication.tsx` still coordinates too many of those seams.

Before adding more edit fields or related-series actions, extract these three
pieces without changing their public behavior:

1. Move AniList collection/patch DTO conversion into the media-list module.
2. Add a bulk-job session coordinator for pending outcome, retry, targeted
   verification, selection locking, and the single terminal workspace commit.
3. Add a related-job planner/coordinator for create-vs-update commands,
   sequential aggregation, cancellation, retry partitioning, and preview
   reconciliation.

The extraction must retain the current regression suite first. In particular,
unknown mutation outcomes must remain verification-locked, command-time
account/media keys must not be replaced with view-time state, and one terminal
outcome must still produce one canonical workspace commit.
