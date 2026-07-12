# ADR 0005: Source state versus derived projection

Status: accepted

The workspace stores full deduplicated collections and load/revision metadata.
Search, status/custom-list filters, sort order, pagination, and selection are
derived state. Sorting always copies IDs and uses entry ID as the final tie
breaker.

The query fingerprint scopes selection to account, media type, and filters but
not page number. This permits page navigation without selection loss while
account, type, or filter changes clear incompatible selections.
