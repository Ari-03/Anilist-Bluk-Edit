// GraphQL wire types and helpers that don't need the DOM (kept separate so
// they are trivially unit-testable).

export interface GraphQLError {
    message: string
    status?: number
    path?: Array<string | number>
    locations?: Array<{ line: number; column: number }>
    /** AniList's validation details, e.g. { mediaId: ['The selected media id is invalid.'] } */
    validation?: Record<string, string[]>
}

export interface GraphQLBody<T> {
    data: T | null
    errors?: GraphQLError[]
}

/** `blamed` failures were named by an error; the rest were never attempted (see splitAliases) */
export type AliasResult<T> =
    | { alias: string; ok: true; data: T }
    | { alias: string; ok: false; message: string; blamed: boolean }

/** Validation details beat AniList's bare "validation" message */
export const describeError = (error: GraphQLError): string => {
    const details = Object.values(error.validation ?? {}).flat()
    return details.length > 0 ? details.join(' ') : error.message
}

export const BATCH_ABORTED = 'Not attempted: AniList rejected the batch because of another entry'

/**
 * Split an aliased response into one result per alias, in the order given.
 * AniList aborts the whole request when any alias fails validation or is not
 * found: every alias comes back null and the error names the culprit only by
 * query line, never by `path`. With `aliasLines` (the line each alias sits on)
 * the culprit is `blamed` and the others are reported as not attempted, so the
 * caller can re-send them.
 */
export function splitAliases<T>(
    body: GraphQLBody<Record<string, T | null | undefined>>,
    aliases: string[],
    aliasLines?: number[]
): AliasResult<T>[] {
    const blame = new Map<string, string>()
    for (const error of body.errors ?? []) {
        const head = error.path?.[0]
        const line = error.locations?.[0]?.line
        const alias =
            typeof head === 'string' ? head
            : aliasLines && line !== undefined ? aliases[aliasLines.indexOf(line)]
            : undefined
        if (alias && !blame.has(alias)) blame.set(alias, describeError(error))
    }
    const first = body.errors?.[0]
    const fallback =
        blame.size > 0 ? BATCH_ABORTED
        : first ? describeError(first)
        : 'AniList returned no result for this entry'

    return aliases.map(alias => {
        const data = body.data?.[alias]
        if (data) return { alias, ok: true, data }
        const message = blame.get(alias)
        return message !== undefined
            ? { alias, ok: false, message, blamed: true }
            : { alias, ok: false, message: fallback, blamed: false }
    })
}

/** Thrown when a request has no usable data. `status` is the HTTP status the proxy relayed. */
export class AniListRequestError extends Error {
    constructor(readonly status: number, readonly errors: GraphQLError[]) {
        super(errors.map(describeError).join(', ') || `AniList request failed (${status})`)
        this.name = 'AniListRequestError'
    }
}

export const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)
