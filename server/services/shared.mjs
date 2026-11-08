import { resolve } from 'node:path'

export const PORT = Number(process.env.PORT || process.env.API_PORT || 3000)
export const DIST_DIR = resolve(process.cwd(), 'dist')

export const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '')
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

export const KNOWN_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://hey-man-diamond-test.onrender.com',
  'https://heymandiamondllc.com',
  'https://www.heymandiamondllc.com',
  'https://heymandiamond.com',
  'https://www.heymandiamond.com',
]

export const envAllowed = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map(s => s.trim().replace(/\/$/, ''))
  .filter(Boolean)

export const ALLOWED_ORIGIN = envAllowed[0] || process.env.ALLOWED_ORIGIN || 'http://localhost:5173'

export function isOriginAllowed(requestOrigin, host) {
  if (!requestOrigin) return true
  if (requestOrigin === 'null') return false
  const sameOrigin = requestOrigin === `https://${host}` || requestOrigin === `http://${host}`
  if (sameOrigin) return true
  if (envAllowed.includes(requestOrigin)) return true
  if (KNOWN_ALLOWED_ORIGINS.includes(requestOrigin)) return true
  return false
}

export function getCorsHeaders(req) {
  const origin = req?.headers?.origin
  const host = req?.headers?.host
  let allowOrigin = ALLOWED_ORIGIN
  if (origin && isOriginAllowed(origin, host)) {
    allowOrigin = origin
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Vary': 'Origin',
  }
}

export function getAuthRedirectUrl(req) {
  if (process.env.AUTH_REDIRECT_URL) {
    return process.env.AUTH_REDIRECT_URL.replace(/\/$/, '')
  }
  if (process.env.APP_URL) {
    return `${process.env.APP_URL.replace(/\/$/, '')}/#signin`
  }
  if (process.env.SITE_URL) {
    return `${process.env.SITE_URL.replace(/\/$/, '')}/#signin`
  }
  const origin = req?.headers?.origin
  const host = req?.headers?.host
  if (origin && isOriginAllowed(origin, host) && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
    return `${origin.replace(/\/$/, '')}/#signin`
  }
  if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    const proto = req?.headers?.['x-forwarded-proto'] || 'https'
    return `${proto}://${host}/#signin`
  }
  if (origin && isOriginAllowed(origin, host)) {
    return `${origin.replace(/\/$/, '')}/#signin`
  }
  const nonLocalEnv = envAllowed.find(o => !o.includes('localhost') && !o.includes('127.0.0.1'))
  if (nonLocalEnv) {
    return `${nonLocalEnv.replace(/\/$/, '')}/#signin`
  }
  return 'https://hey-man-diamond-test.onrender.com/#signin'
}

export const headers = getCorsHeaders()

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}

export function json(res, status, body, responseHeaders = {}) {
  const cors = res?._corsHeaders || headers
  res.writeHead(status, {
    ...cors,
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...responseHeaders,
  })
  res.end(JSON.stringify(body))
}

export async function bodyJson(req, limit = 20000) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > limit) {
      const error = new Error('Request body is too large.')
      error.statusCode = 413
      throw error
    }
  }
  try {
    return JSON.parse(raw || '{}')
  } catch {
    const error = new Error('Request body must be valid JSON.')
    error.statusCode = 400
    throw error
  }
}

export function supabaseReady() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
}

export async function db(path, options = {}) {
  if (!supabaseReady()) throw new Error('Database API is not configured')
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Database request failed (${response.status}): ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}
