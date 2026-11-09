import test from 'node:test'
import assert from 'node:assert/strict'

// Set mock env before importing shared services
process.env.SUPABASE_URL = 'https://mock-test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'mock-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'

import {
  authenticatedUser,
  handleSignin,
  handleForgotPassword,
} from '../server/services/auth.mjs'

import {
  handleFlomizStatus,
  cleanFlomizBaseUrl,
  isAllowedFlomizUrl,
} from '../server/services/inventory.mjs'

import {
  sanitizeLink,
} from '../server/services/promotions.mjs'

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
