import test from 'node:test'
import assert from 'node:assert/strict'
import { handleOAuth, handleOAuthCallback } from '../server/services/auth.mjs'
import { parseAuthStatusFromHash, normalizeHashFragment } from '../src/routeUtils.ts'

function mockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.statusCode = status
      this.headers = headers
      return this
    },
    end(content) {
      this.body = content
      return this
    },
  }
  return res
}

function mockRequest(method, body = {}) {
  const chunks = [Buffer.from(JSON.stringify(body))]
  return {
    method,
    headers: { host: 'localhost:3000', origin: 'http://localhost:5173' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

test('OAuth Intent & Registration Flow', async t => {
  await t.test('1. routeUtils parses intent and tokens accurately from URL hash', () => {
    const signinResult = parseAuthStatusFromHash('#signin?intent=signin#access_token=test-tok-123&refresh_token=ref-456&token_type=bearer')
    assert.equal(signinResult.accessToken, 'test-tok-123')
    assert.equal(signinResult.refreshToken, 'ref-456')
    assert.equal(signinResult.intent, 'signin')

    const signupResult = parseAuthStatusFromHash('#signup-customer?intent=signup#access_token=test-tok-789&refresh_token=ref-012&token_type=bearer')
    assert.equal(signupResult.accessToken, 'test-tok-789')
    assert.equal(signupResult.refreshToken, 'ref-012')
    assert.equal(signupResult.intent, 'signup')

    const defaultResult = parseAuthStatusFromHash('#access_token=token-bare')
    assert.equal(defaultResult.accessToken, 'token-bare')
    assert.equal(defaultResult.intent, undefined)
  })

  await t.test('2. handleOAuth preserves intent in redirect URL', async () => {
    const req = { headers: { host: 'localhost:3000', origin: 'http://localhost:5173' } }

    const resSignin = mockResponse()
    await handleOAuth(req, resSignin, new URL('http://localhost:3000/api/auth/oauth?provider=google&intent=signin'))
    const bodySignin = JSON.parse(resSignin.body)
    assert.equal(resSignin.statusCode, 200)
    assert.equal(bodySignin.intent, 'signin')
    assert.ok(decodeURIComponent(bodySignin.url).includes('intent=signin'))

    const resSignup = mockResponse()
    await handleOAuth(req, resSignup, new URL('http://localhost:3000/api/auth/oauth?provider=google&intent=signup'))
    const bodySignup = JSON.parse(resSignup.body)
    assert.equal(resSignup.statusCode, 200)
    assert.equal(bodySignup.intent, 'signup')
    assert.ok(decodeURIComponent(bodySignup.url).includes('intent=signup'))
  })

  await t.test('3. handleOAuthCallback rejects invalid requests and expired tokens', async () => {
    const resNoToken = mockResponse()
    await handleOAuthCallback(mockRequest('POST', { intent: 'signin' }), resNoToken)
    assert.equal(resNoToken.statusCode, 400)
    assert.deepEqual(JSON.parse(resNoToken.body), { error: 'Access token is required.' })

    const resInvalidToken = mockResponse()
    await handleOAuthCallback(mockRequest('POST', { accessToken: 'invalid.token.here', intent: 'signin' }), resInvalidToken)
    assert.equal(resInvalidToken.statusCode, 401)
    assert.deepEqual(JSON.parse(resInvalidToken.body), { error: 'Invalid or expired session. Please sign in again.' })
  })

  await t.test('4. Scenario 2: Unregistered Google account on signin returns notRegistered with exact message', async () => {
    // Mock global fetch to simulate Supabase user verification and admin deletion
    const originalFetch = globalThis.fetch
    let deletedUserId = null

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url)
      // Supabase /auth/v1/user
      if (urlStr.includes('/auth/v1/user') && !urlStr.includes('/admin/users')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 'mock-new-user-uuid',
              email: 'newuser@gmail.com',
              created_at: new Date().toISOString(),
              user_metadata: { full_name: 'New Google User' },
            }
          },
        }
      }
      // Supabase PostgREST queries
      if (urlStr.includes('/rest/v1/')) {
        return {
          ok: true,
          status: 200,
          async text() { return '[]' },
        }
      }
      // Supabase /auth/v1/admin/users/:id DELETE
      if (urlStr.includes('/auth/v1/admin/users/mock-new-user-uuid') && options.method === 'DELETE') {
        deletedUserId = 'mock-new-user-uuid'
        return {
          ok: true,
          status: 200,
          async json() { return {} },
        }
      }
      return originalFetch(url, options)
    }

    try {
      const res = mockResponse()
      await handleOAuthCallback(mockRequest('POST', { accessToken: 'valid-test-token', intent: 'signin' }), res)
      assert.equal(res.statusCode, 200)
      const data = JSON.parse(res.body)
      assert.equal(data.success, false)
      assert.equal(data.notRegistered, true)
      assert.equal(data.message, 'No account found for this Google account. Please sign up first.')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await t.test('5. Scenario 4: Existing user clicking sign up with Google returns alreadyExisted with exact message', async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url)
      if (urlStr.includes('/auth/v1/user') && !urlStr.includes('/admin/users')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 'mock-existing-user-uuid',
              email: 'existing@gmail.com',
              created_at: new Date(Date.now() - 86400000).toISOString(),
              user_metadata: { is_registered: true, full_name: 'Existing User' },
            }
          },
        }
      }
      if (urlStr.includes('/rest/v1/profiles')) {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify([{ id: 'mock-existing-user-uuid', is_registered: true, full_name: 'Existing User' }])
          },
        }
      }
      if (urlStr.includes('/rest/v1/')) {
        return {
          ok: true,
          status: 200,
          async text() { return '[]' },
        }
      }
      return originalFetch(url, options)
    }

    try {
      const res = mockResponse()
      await handleOAuthCallback(mockRequest('POST', { accessToken: 'valid-existing-token', intent: 'signup' }), res)
      assert.equal(res.statusCode, 200)
      const data = JSON.parse(res.body)
      assert.equal(data.success, true)
      assert.equal(data.alreadyExisted, true)
      assert.equal(data.message, 'You already have an account, so we signed you in.')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await t.test('6. Scenario 3: New Google user on signup completes registration', async () => {
    const originalFetch = globalThis.fetch
    let profilePatched = false

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url)
      if (urlStr.includes('/auth/v1/user') && !urlStr.includes('/admin/users')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 'mock-brand-new-uuid',
              email: 'brandnew@gmail.com',
              created_at: new Date().toISOString(),
              user_metadata: { full_name: 'Brand New User' },
            }
          },
        }
      }
      if (urlStr.includes('/rest/v1/profiles') && options.method === 'PATCH') {
        profilePatched = true
        return {
          ok: true,
          status: 200,
          async text() { return '' },
        }
      }
      if (urlStr.includes('/rest/v1/')) {
        return {
          ok: true,
          status: 200,
          async text() { return '[]' },
        }
      }
      if (urlStr.includes('/auth/v1/admin/users/')) {
        return {
          ok: true,
          status: 200,
          async json() { return {} },
        }
      }
      return originalFetch(url, options)
    }

    try {
      const res = mockResponse()
      await handleOAuthCallback(mockRequest('POST', { accessToken: 'valid-new-token', intent: 'signup' }), res)
      assert.equal(res.statusCode, 200)
      const data = JSON.parse(res.body)
      assert.equal(data.success, true)
      assert.equal(data.isNew, true)
      assert.equal(data.alreadyExisted, false)
      assert.equal(data.message, 'Your account has been created successfully! Welcome to Hey Man Diamond.')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
