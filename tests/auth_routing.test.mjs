import test from 'node:test'
import assert from 'node:assert/strict'
import { isOriginAllowed, getCorsHeaders, getAuthRedirectUrl } from '../server/index.mjs'
import { resolveAuthRoute, normalizeHashFragment, parseAuthStatusFromHash } from '../src/routeUtils.ts'

test('Frontend Hash Route Resolution', async t => {
  await t.test('resolves standard navigation routes', () => {
    assert.equal(resolveAuthRoute('#signin'), 'signin')
    assert.equal(resolveAuthRoute('#signup-customer'), 'signup-customer')
    assert.equal(resolveAuthRoute('#signup-dealer'), 'signup-dealer')
  })

  await t.test('returns empty for non-auth hashes or home', () => {
    assert.equal(resolveAuthRoute('#home'), '')
    assert.equal(resolveAuthRoute('#about'), '')
    assert.equal(resolveAuthRoute('#policy-privacy'), '')
    assert.equal(resolveAuthRoute(''), '')
  })

  await t.test('resolves incoming Supabase access token verification hash to signin', () => {
    const hash = '#access_token=eyJhbGciOi...&refresh_token=v-ref...&token_type=bearer&type=signup'
    assert.equal(resolveAuthRoute(hash), 'signin')
  })

  await t.test('resolves incoming Supabase double fragment #signin#access_token=... to signin', () => {
    const hash = '#signin#access_token=eyJhbGciOi...&refresh_token=v-ref...&token_type=bearer&type=signup'
    assert.equal(resolveAuthRoute(hash), 'signin')
  })

  await t.test('resolves auth error hash to signin', () => {
    const hash = '#error=access_denied&error_code=403&error_description=Email+link+is+invalid+or+has+expired'
    assert.equal(resolveAuthRoute(hash), 'signin')
  })

  await t.test('normalizes double fragment so URLSearchParams extracts access_token cleanly', () => {
    const doubleHash = '#signin#access_token=test_token_123&refresh_token=test_ref_456&token_type=bearer&type=signup'
    const normalized = normalizeHashFragment(doubleHash)
    assert.equal(normalized.startsWith('#access_token='), true)

    const params = new URLSearchParams(normalized.slice(1))
    assert.equal(params.get('access_token'), 'test_token_123')
    assert.equal(params.get('refresh_token'), 'test_ref_456')
    assert.equal(params.get('type'), 'signup')
  })

  await t.test('parses expired verification error hash and decodes error description', () => {
    const errorHash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    const status = parseAuthStatusFromHash(errorHash)
    assert.equal(status.kind, 'error')
    assert.equal(status.text, 'Email link is invalid or has expired')
  })

  await t.test('parses double fragment error hash into error status banner', () => {
    const doubleErrorHash = '#signin#error=access_denied&error_description=Email+link+is+invalid+or+has+expired'
    const status = parseAuthStatusFromHash(doubleErrorHash)
    assert.equal(status.kind, 'error')
    assert.equal(status.text, 'Email link is invalid or has expired')
  })

  await t.test('falls back to error code when error_description is absent', () => {
    const errorHash = '#error=access_denied'
    const status = parseAuthStatusFromHash(errorHash)
    assert.equal(status.kind, 'error')
    assert.equal(status.text, 'access_denied')
  })

  await t.test('parses access token hash into success confirmation status', () => {
    const tokenHash = '#access_token=token_abc_123&refresh_token=ref_xyz_456&type=signup'
    const status = parseAuthStatusFromHash(tokenHash)
    assert.equal(status.kind, 'success')
    assert.equal(status.text, 'Your email has been confirmed successfully. You can now sign in to your account.')
    assert.equal(status.accessToken, 'token_abc_123')
    assert.equal(status.refreshToken, 'ref_xyz_456')
  })

  await t.test('returns empty info status for regular navigation hashes', () => {
    assert.deepEqual(parseAuthStatusFromHash('#signin'), { text: '', kind: 'info' })
    assert.deepEqual(parseAuthStatusFromHash('#signup-customer'), { text: '', kind: 'info' })
    assert.deepEqual(parseAuthStatusFromHash('#home'), { text: '', kind: 'info' })
    assert.deepEqual(parseAuthStatusFromHash(''), { text: '', kind: 'info' })
  })
})

test('Server Origin Validation and CORS', async t => {
  await t.test('allows local development origins', () => {
    assert.equal(isOriginAllowed('http://localhost:5173', 'localhost:3000'), true)
    assert.equal(isOriginAllowed('http://localhost:3000', 'localhost:3000'), true)
  })

  await t.test('allows live Render deployment origin', () => {
    assert.equal(isOriginAllowed('https://hey-man-diamond-test.onrender.com', 'hey-man-diamond-test.onrender.com'), true)
  })

  await t.test('allows custom domains and www subdomains', () => {
    assert.equal(isOriginAllowed('https://heymandiamondllc.com', 'heymandiamondllc.com'), true)
    assert.equal(isOriginAllowed('https://www.heymandiamondllc.com', 'heymandiamondllc.com'), true)
    assert.equal(isOriginAllowed('https://heymandiamond.com', 'heymandiamond.com'), true)
    assert.equal(isOriginAllowed('https://www.heymandiamond.com', 'heymandiamond.com'), true)
  })

  await t.test('allows same-origin requests dynamically matching Host header', () => {
    assert.equal(isOriginAllowed('https://custom-proxy.internal', 'custom-proxy.internal'), true)
    assert.equal(isOriginAllowed('http://127.0.0.1:8080', '127.0.0.1:8080'), true)
  })

  await t.test('rejects unauthorized or attacker origins', () => {
    assert.equal(isOriginAllowed('https://attacker.example', 'hey-man-diamond-test.onrender.com'), false)
    assert.equal(isOriginAllowed('https://phishing-heyman.com', 'heymandiamondllc.com'), false)
  })

  await t.test('getCorsHeaders dynamically reflects allowed caller origin', () => {
    const req = {
      headers: {
        origin: 'https://heymandiamondllc.com',
        host: 'heymandiamondllc.com',
      },
    }
    const cors = getCorsHeaders(req)
    assert.equal(cors['Access-Control-Allow-Origin'], 'https://heymandiamondllc.com')
    assert.equal(cors.Vary, 'Origin')
  })
})

test('Dynamic Auth Redirect URL Generation', async t => {
  await t.test('derives redirect URL from custom domain Origin header', () => {
    const req = {
      headers: {
        origin: 'https://heymandiamondllc.com',
        host: 'heymandiamondllc.com',
      },
    }
    assert.equal(getAuthRedirectUrl(req), 'https://heymandiamondllc.com/#signin')
  })

  await t.test('derives redirect URL from live production domain heymandiamond.com', () => {
    const req = {
      headers: {
        origin: 'https://heymandiamond.com',
        host: 'heymandiamond.com',
      },
    }
    assert.equal(getAuthRedirectUrl(req), 'https://heymandiamond.com/#signin')
  })

  await t.test('derives redirect URL from Render Origin header', () => {
    const req = {
      headers: {
        origin: 'https://hey-man-diamond-test.onrender.com',
        host: 'hey-man-diamond-test.onrender.com',
      },
    }
    assert.equal(getAuthRedirectUrl(req), 'https://hey-man-diamond-test.onrender.com/#signin')
  })

  await t.test('derives redirect URL from Host header when Origin is absent (e.g. curl / API)', () => {
    const req = {
      headers: {
        host: 'heymandiamondllc.com',
      },
    }
    assert.equal(getAuthRedirectUrl(req), 'https://heymandiamondllc.com/#signin')
  })

  await t.test('preserves localhost origin during local development', () => {
    const req = {
      headers: {
        origin: 'http://localhost:5173',
        host: 'localhost:3000',
      },
    }
    assert.equal(getAuthRedirectUrl(req), 'http://localhost:5173/#signin')
  })
})
