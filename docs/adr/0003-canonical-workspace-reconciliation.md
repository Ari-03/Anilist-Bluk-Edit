# ADR 0003: Canonical workspace and sparse-patch reconciliation

Status: accepted

Canonical collections are keyed by account and media type and deduplicated by
list-entry ID. Derived filters, sorts, and pages never become source state.

Mutation records are often sparse. A confirmed patch therefore carries its
command media type and mutable values only. Reconciliation merges those values
into the canonical entry, preserving full media metadata, and commits one job
outcome in one state transaction. Refresh responses carry a captured revision
and cannot overwrite newer confirmed work.
