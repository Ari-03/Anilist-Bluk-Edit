import type { RateLimitHints } from './types'

export class SchedulerCancelledError extends Error {
  readonly code = 'CANCELLED'

  constructor(message = 'Request was cancelled before it started') {
    super(message)
    this.name = 'SchedulerCancelledError'
  }
}

export interface AniListTransportErrorOptions {
  status?: number
  code?: string
  ambiguous?: boolean
  rateLimit?: RateLimitHints
  cause?: unknown
}

export class AniListTransportError extends Error {
  readonly status?: number
  readonly code?: string
  readonly ambiguous: boolean
  readonly rateLimit?: RateLimitHints

  constructor(message: string, options: AniListTransportErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AniListTransportError'
    this.status = options.status
    this.code = options.code
    this.ambiguous = options.ambiguous ?? false
    this.rateLimit = options.rateLimit
  }
}

export type AniListGatewayErrorKind =
  | 'authentication'
  | 'validation'
  | 'rate-limit'
  | 'network'
  | 'cancelled'
  | 'unknown'

export interface AniListGatewayErrorOptions {
  kind: AniListGatewayErrorKind
  retryable: boolean
  status?: number
  confirmedInvalidToken?: boolean
  cause?: unknown
}

/** A UI-safe classification for failed read operations. */
export class AniListGatewayError extends Error {
  readonly kind: AniListGatewayErrorKind
  readonly retryable: boolean
  readonly status?: number
  readonly confirmedInvalidToken: boolean

  constructor(message: string, options: AniListGatewayErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AniListGatewayError'
    this.kind = options.kind
    this.retryable = options.retryable
    this.status = options.status
    this.confirmedInvalidToken = options.confirmedInvalidToken ?? false
  }
}

export const isAbortError = (error: unknown): boolean =>
  error instanceof SchedulerCancelledError ||
  (error instanceof DOMException && error.name === 'AbortError') ||
  (error instanceof Error && error.name === 'AbortError')
