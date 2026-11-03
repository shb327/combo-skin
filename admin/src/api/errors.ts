/** Errors from the API, and the fixed messages the app shows for them. Server text is never
 * shown: only the error code is read from a response. */

export type ApiErrorKind = 'network' | 'http'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number
  readonly code: string | null
  /** Seconds from a valid `Retry-After` header, or null. */
  readonly retryAfter: number | null

  constructor(kind: ApiErrorKind, status = 0, code: string | null = null, retryAfter: number | null = null) {
    super(kind === 'network' ? 'The API did not answer' : `The API answered ${status} ${code ?? ''}`.trim())
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}

export function httpError(response: Response, body: unknown): ApiError {
  const detail =
    typeof body === 'object' && body !== null && 'detail' in body ? body.detail : undefined
  const code = typeof detail === 'string' ? detail : null
  const header = response.headers.get('Retry-After') ?? ''
  const retryAfter = /^\d{1,6}$/.test(header) ? Number(header) : null
  return new ApiError('http', response.status, code, retryAfter)
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
