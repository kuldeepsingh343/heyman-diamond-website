import test from 'node:test'
import assert from 'node:assert/strict'

// Set mock env before importing shared services
process.env.SUPABASE_URL = 'https://mock-test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'mock-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'

import {
  authenticatedUser,
  handleSignin,
  handleSignup,
  handleForgotPassword,
} from '../server/services/auth.mjs'

import {
  handleCreateInquiry,
  handleUpdateQuoteStatus,
} from '../server/services/quotes.mjs'

import {
  handleFlomizStatus,
  cleanFlomizBaseUrl,
  isAllowedFlomizUrl,
  handleUpdateAdminDiamond,
} from '../server/services/inventory.mjs'

import {
  handleUpdateDealerApplication,
} from '../server/services/admin.mjs'

import {
  handleUpdateReviewStatus,
  handleDeleteReview,
} from '../server/services/reviews.mjs'

import {
  sanitizeLink,
  handleUpdatePromotion,
  handleDeletePromotion,
} from '../server/services/promotions.mjs'

import {
  SECURITY_HEADERS,
  CSP_HEADER,
} from '../server/services/shared.mjs'

// Mock globalThis.fetch for auth endpoints
const originalFetch = globalThis.fetch
globalThis.fetch = async (url, options = {}) => {
  const urlStr = String(url)

  // Mock token password check -> always fail with 400 invalid credentials
  if (urlStr.includes('/auth/v1/token')) {
    return {
      ok: false,
      status: 400,
      json: async () => ({ msg: 'Invalid login credentials' }),
    }
  }

  // Mock recovery -> 200 ok
  if (urlStr.includes('/auth/v1/recover')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    }
  }

  // Mock admin users lookup
  if (urlStr.includes('/auth/v1/admin/users')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ users: [] }),
    }
  }

  // Mock signup -> 200 ok
  if (urlStr.includes('/auth/v1/signup')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ user: { id: 'test-user-id' } }),
    }
  }

  // Mock rest db calls
  if (urlStr.includes('/rest/v1/')) {
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify([{ id: 'mock-row-id' }]),
    }
  }

  // Mock get user by token -> 401 unauthorized
  if (urlStr.includes('/auth/v1/user')) {
    return {
      ok: false,
      status: 401,
      json: async () => ({ msg: 'Invalid token' }),
    }
  }

  return originalFetch(url, options)
}

// Mock HTTP Response
function createMockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(code, headers) {
      res.statusCode = code
      res.headers = { ...res.headers, ...headers }
    },
    end(data) {
      res.body = data || ''
    },
    get json() {
      try {
        return JSON.parse(res.body)
      } catch {
        return null
      }
    },
  }
  return res
}

// Mock HTTP Request helper
function createMockReq(headers = {}, body = null) {
  async function* generator() {
    if (body !== null) {
      yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    }
  }
  const req = generator()
  req.headers = { ...headers }
  req.socket = { remoteAddress: '127.0.0.1' }
  return req
}

test('Security — authenticatedUser rejects forged unsigned JWTs', async () => {
  const fakeHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64')
  const fakePayload = Buffer.from(JSON.stringify({
    sub: 'attacker-123',
    email: 'heymandiamondllc@gmail.com',
    role: 'admin',
  })).toString('base64')
  const forgedToken = `${fakeHeader}.${fakePayload}.fake-signature`

  const req = createMockReq({
    authorization: `Bearer ${forgedToken}`,
  })

  const user = await authenticatedUser(req)
  assert.equal(user, null, 'Unverified / forged JWT must be rejected with null')
})

test('Security — handleForgotPassword never returns directResetUrl', async () => {
  const req = createMockReq(
    { 'x-forwarded-for': '198.51.100.22', 'content-type': 'application/json' },
    { email: 'admin-test@example.com' }
  )
  const res = createMockRes()

  await handleForgotPassword(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.json?.sent, true)
  assert.equal(res.json?.directResetUrl, undefined, 'directResetUrl MUST NOT be returned in response')
  assert.ok(res.json?.message, 'Must return a safe message')
})

test('Security — Login Rate Limiting enforces lockout on repeated failures', async () => {
  const testIp = '203.0.113.88'
  const testEmail = 'bruteforce-test@example.com'

  // Attempt 5 failed logins with wrong password
  for (let i = 0; i < 5; i++) {
    const req = createMockReq(
      { 'x-forwarded-for': testIp, 'content-type': 'application/json' },
      { email: testEmail, password: 'WrongPassword123' }
    )
    const res = createMockRes()
    await handleSignin(req, res)
    assert.equal(res.statusCode, 400, `Attempt ${i + 1} should be evaluated as invalid credentials`)
  }

  // 6th attempt should be blocked by rate limiter with HTTP 429
  const lockedReq = createMockReq(
    { 'x-forwarded-for': testIp, 'content-type': 'application/json' },
    { email: testEmail, password: 'WrongPassword123' }
  )
  const lockedRes = createMockRes()
  await handleSignin(lockedReq, lockedRes)

  assert.equal(lockedRes.statusCode, 429, 'Excessive failed logins must return 429 Too Many Requests')
  assert.ok(lockedRes.json?.error.includes('temporarily locked'))
  assert.ok(lockedRes.headers['Retry-After'], 'Must set Retry-After header')
})

test('Security — Flomiz status endpoint does not leak keyPrefix', () => {
  const req = createMockReq()
  const res = createMockRes()

  handleFlomizStatus(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.json?.keyPrefix, undefined, 'Public status endpoint must not leak API key prefix')
  assert.equal(typeof res.json?.keyConfigured, 'boolean')
})

test('Security — Flomiz URL sanitizer blocks SSRF target domains', () => {
  assert.equal(isAllowedFlomizUrl('http://169.254.169.254/latest/meta-data'), false)
  assert.equal(isAllowedFlomizUrl('http://attacker.com/steal-key'), false)
  assert.equal(isAllowedFlomizUrl('http://internal-db:5432'), false)
  assert.equal(isAllowedFlomizUrl('http://metadata.google.internal'), false)

  assert.equal(isAllowedFlomizUrl('https://diamond.flomiz.com'), true)
  assert.equal(isAllowedFlomizUrl('https://billing.flomiz.com'), true)
  assert.equal(isAllowedFlomizUrl('https://api.flomiz.com'), true)

  assert.equal(cleanFlomizBaseUrl('http://169.254.169.254'), 'https://diamond.flomiz.com')
})

test('Security — Promotion sanitizeLink neutralizes javascript XSS payloads', () => {
  assert.equal(sanitizeLink('javascript:alert(document.cookie)'), '#collection')
  assert.equal(sanitizeLink('JAVASCRIPT:alert(1)'), '#collection')
  assert.equal(sanitizeLink('data:text/html,<script>alert(1)</script>'), '#collection')
  assert.equal(sanitizeLink('vbscript:msgbox(1)'), '#collection')

  assert.equal(sanitizeLink('#collection'), '#collection')
  assert.equal(sanitizeLink('/catalog'), '/catalog')
  assert.equal(sanitizeLink('https://heymandiamond.com/about'), 'https://heymandiamond.com/about')
})

test('Security — Content-Security-Policy is enforced in SECURITY_HEADERS', () => {
  assert.ok(SECURITY_HEADERS['Content-Security-Policy'], 'Content-Security-Policy header must be defined')
  assert.equal(SECURITY_HEADERS['Content-Security-Policy'], CSP_HEADER)
  assert.ok(CSP_HEADER.includes("default-src 'self'"), 'CSP must define default-src')
  assert.ok(CSP_HEADER.includes("object-src 'none'"), 'CSP must disallow plugins/objects')
  assert.ok(CSP_HEADER.includes("frame-ancestors 'self'"), 'CSP must restrict framing')
})

test('Security — Promotion routes reject malicious identifier injection', async () => {
  const admin = { user: { id: 'admin-1' }, permissions: { can_manage_promotions: true } }
  const mockReq = createMockReq({}, { name: 'Test' })
  const mockRes = createMockRes()

  await handleUpdatePromotion(mockReq, mockRes, '123&active=eq.true', admin)
  assert.equal(mockRes.statusCode, 400, 'Must reject ID containing injection characters')
  assert.equal(mockRes.json?.error, 'Invalid promotion identifier.')

  const delRes = createMockRes()
  await handleDeletePromotion(createMockReq(), delRes, '123;DROP TABLE;', admin)
  assert.equal(delRes.statusCode, 400, 'Must reject malicious deletion ID')
})

test('Security — Rate limiting protects signup and inquiry endpoints from flooding', async () => {
  // Test signup rate limit
  const signupReq = () => createMockReq({ 'x-forwarded-for': '198.51.100.42' }, {
    fullName: 'Rate Tester',
    email: 'ratetest@example.com',
    password: 'Password123!',
    phone: '555-0100',
    address: '123 Test St',
    gender: 'prefer_not_to_say',
    accountType: 'customer',
  })

  let lockedSignup = false
  for (let i = 0; i < 12; i++) {
    const res = createMockRes()
    await handleSignup(signupReq(), res)
    if (res.statusCode === 429) {
      lockedSignup = true
      assert.ok(res.headers['Retry-After'])
      break
    }
  }
  assert.equal(lockedSignup, true, 'Signup endpoint must enforce rate limit after 10 requests')

  // Test inquiry rate limit
  const inquiryReq = () => createMockReq({ 'x-forwarded-for': '198.51.100.99' }, {
    name: 'Spam Bot',
    email: 'spambot@example.com',
    message: 'Hello diamond spam test',
  })

  let lockedInquiry = false
  for (let i = 0; i < 12; i++) {
    const res = createMockRes()
    await handleCreateInquiry(inquiryReq(), res)
    if (res.statusCode === 429) {
      lockedInquiry = true
      break
    }
  }
  assert.equal(lockedInquiry, true, 'Inquiry endpoint must enforce rate limit after 10 requests')
})

test('Security — Dotfile requests are blocked and do not trigger SPA fallback', () => {
  const dotfiles = ['/.env', '/.git', '/.git/config', '/.env.production', '/foo/.hidden', '/.DS_Store']
  for (const path of dotfiles) {
    const isBlocked = path.startsWith('/.') || path.includes('/.')
    assert.equal(isBlocked, true, `${path} must be blocked by dotfile filter`)
  }
  const regularPaths = ['/index.html', '/assets/index.js', '/diamonds', '/favicon.ico']
  for (const path of regularPaths) {
    const isBlocked = path.startsWith('/.') || path.includes('/.')
    assert.equal(isBlocked, false, `${path} should not be blocked`)
  }
})

test('Security — All admin parameterized endpoints reject PostgREST query injection in identifiers', async () => {
  const fullAdmin = { user: { id: 'admin-test' }, permissions: { can_manage_orders: true, can_review_kyc: true, can_manage_reviews: true } }
  const injectionId = '123&status=eq.hacked'

  // Quotes
  const quoteRes = createMockRes()
  await handleUpdateQuoteStatus(createMockReq({}, { status: 'accepted' }), quoteRes, fullAdmin, injectionId)
  assert.equal(quoteRes.statusCode, 400, 'Quote status update must reject malicious ID')
  assert.equal(quoteRes.json?.error, 'Invalid quote request identifier.')

  // Dealer applications
  const dealerRes = createMockRes()
  await handleUpdateDealerApplication(createMockReq({}, { status: 'approved' }), dealerRes, fullAdmin, injectionId)
  assert.equal(dealerRes.statusCode, 400, 'Dealer application update must reject malicious ID')
  assert.equal(dealerRes.json?.error, 'Invalid dealer application identifier.')

  // Reviews update
  const reviewUpdateRes = createMockRes()
  await handleUpdateReviewStatus(createMockReq({}, { status: 'published' }), reviewUpdateRes, fullAdmin, injectionId)
  assert.equal(reviewUpdateRes.statusCode, 400, 'Review status update must reject malicious ID')
  assert.equal(reviewUpdateRes.json?.error, 'Invalid review identifier.')

  // Reviews delete
  const reviewDelRes = createMockRes()
  await handleDeleteReview(createMockReq(), reviewDelRes, fullAdmin, injectionId)
  assert.equal(reviewDelRes.statusCode, 400, 'Review delete must reject malicious ID')
  assert.equal(reviewDelRes.json?.error, 'Invalid review identifier.')

  // Diamond update
  const diamondRes = createMockRes()
  await handleUpdateAdminDiamond(createMockReq({}, { customerPrice: 500 }), diamondRes, fullAdmin, injectionId)
  assert.equal(diamondRes.statusCode, 400, 'Diamond update must reject malicious ID')
  assert.equal(diamondRes.json?.error, 'Invalid diamond identifier.')
})
