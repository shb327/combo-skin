/** Errors from the API, and the fixed messages the app shows for them. Server text is never
 * shown: only the error code is read from a response. */

import type { components } from './schema'

export type ApiErrorKind = 'network' | 'http'

/** Every code the API declares for an error's `detail` (422 aside), from `api/openapi.json`. */
export type ErrorCode = components['schemas']['Error']['detail']

/** One entry of a 422 body: where the problem is and its code. The server's text, the echoed
 * input and its context are dropped. */
export interface Problem {
  loc: (string | number)[]
  type: string
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number
  /** The error's code. A newer API could send one this build does not list, so every switch
   * over it keeps a default. */
  readonly code: ErrorCode | null
  /** Seconds from a valid `Retry-After` header, or null. */
  readonly retryAfter: number | null
  /** The entries of a 422 body; empty otherwise. */
  readonly problems: Problem[]

  constructor(
    kind: ApiErrorKind,
    status = 0,
    code: ErrorCode | null = null,
    retryAfter: number | null = null,
    problems: Problem[] = [],
  ) {
    super(kind === 'network' ? 'The API did not answer' : `The API answered ${status} ${code ?? ''}`.trim())
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
    this.problems = problems
  }
}

function problems(detail: unknown): Problem[] {
  if (!Array.isArray(detail)) return []
  return detail.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { loc, type } = entry as { loc?: unknown; type?: unknown }
    if (!Array.isArray(loc) || typeof type !== 'string') return []
    const path = loc.filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
    return [{ loc: path, type }]
  })
}

export function httpError(response: Response, body: unknown): ApiError {
  const detail =
    typeof body === 'object' && body !== null && 'detail' in body ? body.detail : undefined
  const code = typeof detail === 'string' ? (detail as ErrorCode) : null
  const header = response.headers.get('Retry-After') ?? ''
  const retryAfter = /^\d{1,6}$/.test(header) ? Number(header) : null
  return new ApiError('http', response.status, code, retryAfter, problems(detail))
}

export const MESSAGES = {
  invalidCredentials: 'Wrong username or password.',
  tooManyAttempts: 'Too many attempts.',
  originNotAllowed:
    'The API refused this address. Add this origin to ADMIN_ORIGINS in the API settings.',
  network:
    'Cannot reach the API. Check that it is running, and that this origin is listed in ADMIN_ORIGINS in the API settings.',
  generic: 'Something went wrong. Try again.',
  sessionEnded: 'Your session has ended. Log in again.',
} as const

/** The message for any failure. Codes the app does not know get the generic message. */
export function errorMessage(failure: unknown): string {
  if (!(failure instanceof ApiError)) return MESSAGES.generic
  if (failure.kind === 'network') return MESSAGES.network
  switch (failure.code) {
    case 'invalid_credentials':
      return MESSAGES.invalidCredentials
    case 'too_many_attempts':
      return MESSAGES.tooManyAttempts
    case 'origin_not_allowed':
      return MESSAGES.originNotAllowed
    case 'not_authenticated':
      return MESSAGES.sessionEnded
    default:
      return MESSAGES.generic
  }
}
