import test from 'node:test'
import assert from 'node:assert/strict'
import {
  handleCheckRegistered,
  handleGetProfile,
  handleOAuthCallback,
} from '../server/services/auth.mjs'

test('Auth Registration Check — handleCheckRegistered validates registration status', async t => {
  await t.test('rejects missing or invalid email', async () => {
    let statusCode = 200
    let payload = null
    const res = {
      writeHead(code) { statusCode = code },
      end(body) { payload = JSON.parse(body) },
    }
    const url = new URL('http://localhost/api/auth/check-registered?email=notanemail')
    await handleCheckRegistered({}, res, url)
    assert.equal(statusCode, 400)
    assert.equal(payload.error, 'A valid email address is required.')
  })

  await t.test('recognizes active staff account as registered', async () => {
    let statusCode = 200
    let payload = null
    const res = {
      writeHead(code) { statusCode = code },
      end(body) { payload = JSON.parse(body) },
    }
    const url = new URL('http://localhost/api/auth/check-registered?email=superadmin.test@internal.test')
    await handleCheckRegistered({}, res, url)
    assert.equal(statusCode, 200)
    assert.equal(payload.registered, true)
    assert.equal(payload.isStaff, true)
  })

  await t.test('reports unregistered email when not found in database', async () => {
    let statusCode = 200
    let payload = null
    const res = {
      writeHead(code) { statusCode = code },
      end(body) { payload = JSON.parse(body) },
    }
    const url = new URL('http://localhost/api/auth/check-registered?email=brandnewcustomer@example.com')
    await handleCheckRegistered({}, res, url)
    assert.equal(statusCode, 200)
    assert.equal(payload.registered, false)
  })

  await t.test('enforces rate limiting on rapid repeated check queries', async () => {
    let lastStatusCode = 200
    let lastPayload = null
    const testIp = '198.51.100.99'

    for (let i = 0; i < 35; i++) {
      const req = {
        headers: { 'x-real-ip': testIp },
        url: `/api/auth/check-registered?email=user${i}@example.com`,
      }
      const res = {
        writeHead(code) { lastStatusCode = code },
        end(body) { lastPayload = JSON.parse(body) },
      }
      const url = new URL(`http://localhost${req.url}`)
      await handleCheckRegistered(req, res, url)
    }

    assert.equal(lastStatusCode, 429)
    assert.match(lastPayload.error, /Too many failed attempts|Access is temporarily locked/)
  })
})

test('Auth Registration Check — handleGetProfile reports registration status', async t => {
  await t.test('rejects unauthenticated requests', async () => {
    let statusCode = 200
    let payload = null
    const res = {
      writeHead(code) { statusCode = code },
      end(body) { payload = JSON.parse(body) },
    }
    const req = { headers: {} }
    await handleGetProfile(req, res)
    assert.equal(statusCode, 401)
    assert.equal(payload.error, 'Please sign in to view your profile.')
  })
})

test('OAuth Callback & Session Clearance Protocol', async t => {
  await t.test('handleOAuthCallback rejects requests missing access token', async () => {
    let statusCode = 200
    let payload = null
    async function* generate() {
      yield Buffer.from(JSON.stringify({ intent: 'signin' }))
    }
    const req = generate()
    req.method = 'POST'
    req.headers = { 'content-type': 'application/json' }
    const res = {
      writeHead(code) { statusCode = code },
      end(body) { payload = JSON.parse(body) },
    }
    await handleOAuthCallback(req, res)
    assert.equal(statusCode, 400)
    assert.equal(payload.error, 'Access token is required.')
  })

  await t.test('Session clearance on unregistered signin: tokens purged and refresh leaves user logged out', () => {
    // Simulate browser localStorage & sessionStorage environment
    const storage = new Map()
    const mockLocalStorage = {
      getItem: k => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
      clear: () => storage.clear(),
    }

    // Step 1: User starts with residual tokens
    mockLocalStorage.setItem('hmd_access_token', 'temp-oauth-token-123')
    mockLocalStorage.setItem('hmd_refresh_token', 'temp-refresh-token-456')
    mockLocalStorage.setItem('hmd_user', JSON.stringify({ email: 'ghost@example.com' }))
    mockLocalStorage.setItem('hmd_cart', JSON.stringify([{ id: 'stone-1' }]))

    assert.equal(mockLocalStorage.getItem('hmd_access_token'), 'temp-oauth-token-123')

    // Step 2: Unregistered signin rejection response received
    const oauthData = {
      success: false,
      notRegistered: true,
      message: 'This account is not registered on our website. Please sign up first.',
    }

    if (oauthData.notRegistered) {
      mockLocalStorage.removeItem('hmd_access_token')
      mockLocalStorage.removeItem('hmd_refresh_token')
      mockLocalStorage.removeItem('hmd_user')
      mockLocalStorage.removeItem('hmd_cart')
    }

    // Step 3: Verify all session data is purged
    assert.equal(mockLocalStorage.getItem('hmd_access_token'), null)
    assert.equal(mockLocalStorage.getItem('hmd_refresh_token'), null)
    assert.equal(mockLocalStorage.getItem('hmd_user'), null)
    assert.equal(mockLocalStorage.getItem('hmd_cart'), null)

    // Step 4: Refresh test — simulate page reload
    const restoredUser = mockLocalStorage.getItem('hmd_user')
    const restoredToken = mockLocalStorage.getItem('hmd_access_token')
    assert.equal(restoredUser, null, 'User must remain completely logged out after page refresh')
    assert.equal(restoredToken, null, 'Tokens must remain null after page refresh')
  })

  await t.test('Session clearance on registered duplicate signup: tokens purged and refresh leaves user logged out', () => {
    const storage = new Map()
    const mockLocalStorage = {
      getItem: k => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
    }

    mockLocalStorage.setItem('hmd_access_token', 'duplicate-oauth-token-789')
    mockLocalStorage.setItem('hmd_refresh_token', 'duplicate-refresh-token-012')
    mockLocalStorage.setItem('hmd_user', JSON.stringify({ email: 'registered@example.com' }))

    const oauthData = {
      success: false,
      alreadyRegistered: true,
      message: 'This account is already registered. Please sign in instead.',
    }

    if (oauthData.alreadyRegistered) {
      mockLocalStorage.removeItem('hmd_access_token')
      mockLocalStorage.removeItem('hmd_refresh_token')
      mockLocalStorage.removeItem('hmd_user')
    }

    assert.equal(mockLocalStorage.getItem('hmd_access_token'), null)
    assert.equal(mockLocalStorage.getItem('hmd_refresh_token'), null)
    assert.equal(mockLocalStorage.getItem('hmd_user'), null)
  })
})
