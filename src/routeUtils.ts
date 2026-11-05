/**
 * Pure client-side routing and hash parsing utilities for Heyman Diamond LLC.
 * Zero DOM/history side-effects in route resolution functions.
 */

export interface AuthStatusResult {
  text: string
  kind: 'info' | 'error' | 'success'
  accessToken?: string
  refreshToken?: string
}

export interface UserLike {
  email?: string
  account_type?: string
}

export function isStaffOrAdmin(user?: UserLike | null): boolean {
  if (!user || !user.email) return false
  if (user.account_type === 'admin') return true
  const em = user.email.toLowerCase().trim()
  return (
    em.endsWith('@heymandiamond.com') ||
    em === 'heymandiamondllc@gmail.com' ||
    em === 'heymandiamonllc@gmail.com' ||
    em === 'kuldeepsingh343@gmail.com' ||
    em === 'chauhanenterprises09@gmail.com'
  )
}

/**
 * Normalizes double-fragment URLs (e.g. Supabase auth redirects like #signin#access_token=...
 * or #signin#error=...) into a single clean hash fragment (e.g. #access_token=... or #error=...).
 */
export function normalizeHashFragment(hash: string): string {
  if (!hash) return ''

  // Normalize double fragments such as #signin#access_token=... or #signup-customer#access_token=...
  if (hash.includes('access_token=')) {
    const tokenIndex = hash.indexOf('access_token=')
    if (tokenIndex > 1) {
      return '#' + hash.slice(tokenIndex)
    }
  }

  // Normalize double fragments such as #signin#error=... or #signin#error_description=...
  if (hash.includes('error=') || hash.includes('error_description=')) {
    const errIdx = hash.indexOf('error=') !== -1 ? hash.indexOf('error=') : hash.indexOf('error_description=')
    if (errIdx > 1) {
      return '#' + hash.slice(errIdx)
    }
  }

  return hash
}

/**
 * Pure route resolver: inspects hash fragment and returns the active auth route
 * ('signin', 'signup-customer', 'signup-dealer', or '' for home/policy pages).
 * Does NOT perform history manipulation or DOM side-effects.
 */
export function resolveAuthRoute(hash?: string): string {
  const currentHash = hash ?? (typeof window !== 'undefined' ? window.location.hash : '')
  if (!currentHash) return ''

  // Standard auth routes: #signup-customer, #signup-dealer, #signin, #account, #admin
  const standardMatch = currentHash.match(/^#(signup-customer|signup-dealer|signin|account|admin)$/)
  if (standardMatch) return standardMatch[1]

  // Supabase verification redirect tokens (e.g. #access_token=... or #signin#access_token=...)
  // or error fragments (e.g. #error=... or #error_description=...)
  if (currentHash.includes('access_token=') || currentHash.includes('error=') || currentHash.includes('error_description=')) {
    return 'signin'
  }

  // Handle #signin with query parameters or trailing fragment, e.g. #signin?... or #signin&...
  if (/^#signin[#&?]/.test(currentHash)) {
    return 'signin'
  }

  return ''
}

/**
 * Parses authentication status, tokens, and error parameters from URL hash fragments
 * returned by Supabase GoTrue Auth (e.g. confirmation links, expired tokens, errors).
 */
export function parseAuthStatusFromHash(hash?: string): AuthStatusResult {
  const rawHash = hash ?? (typeof window !== 'undefined' ? window.location.hash : '')
  if (!rawHash) return { text: '', kind: 'info' }

  const normalized = normalizeHashFragment(rawHash)
  if (!normalized) return { text: '', kind: 'info' }

  const params = new URLSearchParams(normalized.replace(/^#+/, ''))

  // 1. Check for error parameters (e.g. expired or invalid verification links)
  const errorDescription = params.get('error_description')
  const errorCode = params.get('error')
  if (errorDescription || errorCode) {
    const rawDesc = errorDescription || errorCode || 'Verification link is invalid or has expired.'
    let decodedText: string
    try {
      decodedText = decodeURIComponent(rawDesc.replace(/\+/g, ' '))
    } catch {
      decodedText = rawDesc
    }
    return { text: decodedText, kind: 'error' }
  }

  // 2. Check for successful email verification access tokens or OAuth redirect tokens
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (accessToken) {
    const isSignupConfirm = params.get('type') === 'signup'
    return {
      text: isSignupConfirm
        ? 'Your email has been confirmed successfully. You can now sign in to your account.'
        : 'You are signed in successfully.',
      kind: 'success',
      accessToken,
      refreshToken: refreshToken ?? undefined,
    }
  }

  return { text: '', kind: 'info' }
}
