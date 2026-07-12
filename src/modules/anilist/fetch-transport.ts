import { AdaptiveRateScheduler } from './scheduler'
import { AniListTransportError, SchedulerCancelledError } from './errors'
import type {
  AccountId,
  GraphQLError,
  GraphQLRequest,
  GraphQLResult,
  GraphQLTransport,
  RateLimitHints,
} from './types'

export const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co'

export interface AniListFetchTransportOptions {
  withAccessToken: <T>(
    accountId: AccountId,
    operation: (accessToken: string) => Promise<T>,
  ) => Promise<T>
  scheduler?: AdaptiveRateScheduler
  fetch?: typeof fetch
  requestTimeoutMs?: number
}

interface GraphQLPayload<T> {
  data?: T | null
  errors?: readonly GraphQLError[]
}

const transientGraphQLErrorStatus = (
  errors: readonly GraphQLError[] | undefined,
): number | undefined => {
  const globalError = errors?.find(
    (error) => !error.path || error.path.length === 0,
  )
  if (!globalError) return undefined
  const raw =
    globalError.extensions?.status ?? globalError.extensions?.statusCode
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  return parsed === 403 ||
    parsed === 429 ||
    parsed === 502 ||
    parsed === 503 ||
    parsed === 504
    ? parsed
    : undefined
}

const hasUsableGraphQLData = (data: unknown): boolean => {
  if (data === null || data === undefined) return false
  if (typeof data !== 'object' || Array.isArray(data)) return true
  return Object.values(data).some((value) => value !== null && value !== undefined)
}

const numberHeader = (headers: Headers, name: string): number | undefined => {
  const value = headers.get(name)
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const parseRetryAfter = (headers: Headers, now: number): number | undefined => {
  const value = headers.get('Retry-After')
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined
}

export const readRateLimitHints = (headers: Headers, now = Date.now()): RateLimitHints => {
  const limit = numberHeader(headers, 'X-RateLimit-Limit')
  const remaining = numberHeader(headers, 'X-RateLimit-Remaining')
  const rawReset = numberHeader(headers, 'X-RateLimit-Reset')
  const retryAfterMs = parseRetryAfter(headers, now)

  return {
    ...(limit === undefined ? {} : { limit }),
    ...(remaining === undefined ? {} : { remaining }),
    ...(rawReset === undefined ? {} : { resetAt: rawReset * 1_000 }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  }
}

/** Direct browser transport. Tokens are sent only in AniList's Authorization header. */
export class AniListFetchTransport implements GraphQLTransport {
  readonly scheduler: AdaptiveRateScheduler
  private readonly withAccessToken: AniListFetchTransportOptions['withAccessToken']
  private readonly fetcher: typeof fetch
  private readonly requestTimeoutMs: number

  constructor(options: AniListFetchTransportOptions) {
    this.withAccessToken = options.withAccessToken
    this.scheduler = options.scheduler ?? new AdaptiveRateScheduler()
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000
  }

  async execute<T>(request: GraphQLRequest): Promise<GraphQLResult<T>> {
    try {
      return await this.withAccessToken(request.accountId, (token) =>
        this.scheduler.schedule(
          request.kind,
          async () => {
            let response: Response
            const requestController = new AbortController()
            let timedOut = false
            const forwardReadCancellation = () =>
              requestController.abort(request.signal?.reason)
            if (request.kind === 'read' && request.signal) {
              request.signal.addEventListener('abort', forwardReadCancellation, {
                once: true,
              })
            }
            const timeout = globalThis.setTimeout(() => {
              timedOut = true
              requestController.abort(
                new DOMException('AniList request timed out.', 'TimeoutError'),
              )
            }, this.requestTimeoutMs)
            try {
              try {
                response = await this.fetcher(ANILIST_GRAPHQL_URL, {
                  method: 'POST',
                  headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    query: request.query,
                    variables: request.variables,
                  }),
                  // User cancellation reaches reads only. Mutations are aborted
                  // solely by the transport timeout and are then ambiguous.
                  signal: requestController.signal,
                })
              } catch (error) {
                if (request.kind === 'read' && request.signal?.aborted) {
                  throw new SchedulerCancelledError()
                }
                if (timedOut) {
                  throw new AniListTransportError('The AniList request timed out.', {
                    code: 'ETIMEDOUT',
                    ambiguous: request.kind === 'mutation',
                    cause: error,
                  })
                }
                throw new AniListTransportError('Could not reach AniList.', {
                  code: 'NETWORK_ERROR',
                  ambiguous: request.kind === 'mutation',
                  cause: error,
                })
              }

              const rateLimit = readRateLimitHints(response.headers)
              let payload: GraphQLPayload<T>
              try {
                const rawBody = await response.text()
                payload = rawBody
                  ? (JSON.parse(rawBody) as GraphQLPayload<T>)
                  : {}
              } catch (error) {
                if (request.kind === 'read' && request.signal?.aborted) {
                  throw new SchedulerCancelledError()
                }
                if (timedOut) {
                  throw new AniListTransportError('The AniList request timed out.', {
                    code: 'ETIMEDOUT',
                    ambiguous: request.kind === 'mutation',
                    rateLimit,
                    cause: error,
                  })
                }
                throw new AniListTransportError(
                  'AniList returned a non-JSON response.',
                  {
                    status: response.status,
                    ambiguous: request.kind === 'mutation',
                    rateLimit,
                    cause: error,
                  },
                )
              }

              const result: GraphQLResult<T> = {
                data: payload.data ?? null,
                errors: payload.errors ?? [],
                status: response.status,
                rateLimit,
              }

              // AniList sometimes reports an upstream/rate-limit status only
              // inside a successful HTTP GraphQL envelope. Surface a global,
              // no-data transient error while still inside the scheduler so an
              // idempotent read can retry. Alias-level partial data is always
              // returned for the gateway to reconcile.
              if (request.kind === 'read' && !hasUsableGraphQLData(payload.data)) {
                const transientStatus =
                  transientGraphQLErrorStatus(payload.errors) ??
                  (response.status === 403 ||
                  response.status === 429 ||
                  response.status === 502 ||
                  response.status === 503 ||
                  response.status === 504
                    ? response.status
                    : undefined)
                if (transientStatus !== undefined) {
                  throw new AniListTransportError(
                    payload.errors?.map((error) => error.message).join(', ') ||
                      `AniList read failed (${transientStatus}).`,
                    { status: transientStatus, rateLimit },
                  )
                }
              }

              // Preserve partial GraphQL data, even on an unusual HTTP status.
              if (
                response.ok ||
                (payload.data !== undefined && payload.data !== null)
              ) {
                return { value: result, rateLimit }
              }

              const message = payload.errors
                ?.map((error) => error.message)
                .join(', ')
              throw new AniListTransportError(
                message || `AniList request failed (${response.status}).`,
                {
                  status: response.status,
                  ambiguous:
                    request.kind === 'mutation' &&
                    response.status !== 400 &&
                    response.status !== 401 &&
                    response.status !== 403 &&
                    response.status !== 422 &&
                    response.status !== 429,
                  rateLimit,
                },
              )
            } finally {
              globalThis.clearTimeout(timeout)
              request.signal?.removeEventListener(
                'abort',
                forwardReadCancellation,
              )
            }
          },
          request.signal,
        ),
      )
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error.code === 'reauth-required' || error.code === 'account-not-found')
      ) {
        throw new AniListTransportError('This AniList account needs to be reconnected.', {
          status: 401,
          ambiguous: false,
          cause: error,
        })
      }
      throw error
    }
  }
}
