// GraphQL wire types and helpers that don't need the DOM (kept separate so
// they are trivially unit-testable).

export interface GraphQLError {
    message: string
    status?: number
    path?: Array<string | number>
    locations?: Array<{ line: number; column: number }>
}

export interface GraphQLBody<T> {
    data: T | null
    errors?: GraphQLError[]
}

export type AliasResult<T> =
    | { alias: string; ok: true; data: T }
    | { alias: string; ok: false; message: string }

/**
 * Split a partially-failed aliased response into one result per alias, in the
 * order given. An alias succeeds iff its data is non-null; failures get the
 * error whose `path` names the alias, or the first error as a fallback.
 */
export function splitAliases<T>(
    body: GraphQLBody<Record<string, T | null | undefined>>,
    aliases: string[]
): AliasResult<T>[] {
    const byPath = new Map<string, string>()
    for (const error of body.errors ?? []) {
        const head = error.path?.[0]
        if (typeof head === 'string' && !byPath.has(head)) byPath.set(head, error.message)
    }
    const fallback = body.errors?.[0]?.message ?? 'AniList returned no result for this entry'

    return aliases.map(alias => {
        const data = body.data?.[alias]
        return data
            ? { alias, ok: true, data }
            : { alias, ok: false, message: byPath.get(alias) ?? fallback }
    })
}

/** Thrown when a request has no usable data. `status` is the HTTP status the proxy relayed. */
export class AniListRequestError extends Error {
    constructor(readonly status: number, readonly errors: GraphQLError[]) {
        super(errors.map(e => e.message).join(', ') || `AniList request failed (${status})`)
        this.name = 'AniListRequestError'
    }
}

export const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)
