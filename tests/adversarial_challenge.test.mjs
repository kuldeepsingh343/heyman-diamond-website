import test from 'node:test'
import assert from 'node:assert/strict'
import { isOriginAllowed, getCorsHeaders, getAuthRedirectUrl } from '../server/index.mjs'
import { resolveAuthRoute, normalizeHashFragment } from '../src/routeUtils.ts'

// Create mock browser window environment for testing
function createMockWindow(initialHash = '', pathname = '/') {
  let currentHash = initialHash
  let currentPath = pathname
  return {
    location: {
      get hash() {
        return currentHash
      },
      set hash(val) {
        currentHash = val
      },
      pathname: currentPath,
    },
    history: {
      replaceState(_state, _title, url) {
        const hashIdx = url.indexOf('#')
        if (hashIdx !== -1) {
          currentPath = url.slice(0, hashIdx)
          currentHash = url.slice(hashIdx)
        } else {
          currentPath = url
          currentHash = ''
        }
      },
    },
  }
}

// Instantiate resolveAuthRoute and test window hash normalization
function executeResolveAuthRoute(hash, mockWin = null) {
  const win = mockWin || createMockWindow(hash || '')
  if (hash && (hash.includes('#signin#') || (hash.includes('#') && hash.indexOf('access_token=') > 1))) {
    const normalized = normalizeHashFragment(hash)
    if (normalized.startsWith('#access_token=')) {
      win.history.replaceState(null, '', win.location.pathname + normalized)
    }
  }
  return {
    result: resolveAuthRoute(hash),
    window: win,
  }
}

test('ADVERSARIAL SUITE 1: resolveAuthRoute in src/App.tsx', async t => {
  await t.test('1.1 Standard navigation routes resolve accurately', () => {
    assert.equal(executeResolveAuthRoute('#signin').result, 'signin')
    assert.equal(executeResolveAuthRoute('#signup-customer').result, 'signup-customer')
    assert.equal(executeResolveAuthRoute('#signup-dealer').result, 'signup-dealer')
  })

  await t.test('1.2 Non-auth and policy hashes return empty string', () => {
    assert.equal(executeResolveAuthRoute('#home').result, '')
    assert.equal(executeResolveAuthRoute('#about').result, '')
    assert.equal(executeResolveAuthRoute('#policy-privacy').result, '')
    assert.equal(executeResolveAuthRoute('#policy-shipping').result, '')
    assert.equal(executeResolveAuthRoute('#policy-returns').result, '')
  })

  await t.test('1.3 Invalid, empty, or degenerate hash fragments return empty string', () => {
    assert.equal(executeResolveAuthRoute('').result, '')
    assert.equal(executeResolveAuthRoute(null).result, '')
    assert.equal(executeResolveAuthRoute(undefined).result, '')
    assert.equal(executeResolveAuthRoute('#').result, '')
    assert.equal(executeResolveAuthRoute('##').result, '')
    assert.equal(executeResolveAuthRoute('###').result, '')
    assert.equal(executeResolveAuthRoute('#random').result, '')
    assert.equal(executeResolveAuthRoute('#invalid-route-name').result, '')
  })

  await t.test('1.4 Double fragments (#signin#access_token=...) are normalized and resolve to signin', () => {
    const rawHash = '#signin#access_token=eyJhbGciOi_mock_token&refresh_token=mock_refresh_123&token_type=bearer&type=signup'
    const win = createMockWindow(rawHash)
    const { result } = executeResolveAuthRoute(rawHash, win)

    assert.equal(result, 'signin')
    // Verify window.history normalized the hash
    assert.equal(win.location.hash.startsWith('#access_token='), true)
    assert.equal(win.location.hash.includes('#signin#'), false)

    // Verify URLSearchParams extraction works identically to src/AuthPages.tsx:9-12
    const params = new URLSearchParams(win.location.hash.slice(1))
    assert.equal(params.get('access_token'), 'eyJhbGciOi_mock_token')
    assert.equal(params.get('refresh_token'), 'mock_refresh_123')
    assert.equal(params.get('token_type'), 'bearer')
    assert.equal(params.get('type'), 'signup')
  })

  await t.test('1.5 Bare Supabase access token fragments resolve to signin without breaking', () => {
    const rawHash = '#access_token=eyJhbGciOi_mock_token&refresh_token=mock_refresh_456&token_type=bearer&type=signup'
    const win = createMockWindow(rawHash)
    const { result } = executeResolveAuthRoute(rawHash, win)

    assert.equal(result, 'signin')
    // When hash is already bare #access_token=, it should remain untouched
    assert.equal(win.location.hash, rawHash)

    const params = new URLSearchParams(win.location.hash.slice(1))
    assert.equal(params.get('access_token'), 'eyJhbGciOi_mock_token')
  })

  await t.test('1.6 Error fragments from Supabase GoTrue resolve safely to signin', () => {
    const rawHash = '#error=access_denied&error_code=403&error_description=Confirmation+link+expired'
    const win = createMockWindow(rawHash)
    const { result } = executeResolveAuthRoute(rawHash, win)

    assert.equal(result, 'signin')
    // No bad replaceState should happen when access_token= is not present
    assert.equal(win.location.hash, rawHash)
  })

  await t.test('1.7 Double fragment with error (#signin#error=...) resolves to signin safely', () => {
    const rawHash = '#signin#error=server_error&error_description=Unexpected+failure'
    const win = createMockWindow(rawHash)
    const { result } = executeResolveAuthRoute(rawHash, win)

    assert.equal(result, 'signin')
    // Ensure replaceState was not called with invalid tokenIndex
    assert.equal(win.location.hash, rawHash)
  })

  await t.test('1.8 Trailing query parameters on signin resolve to signin', () => {
    assert.equal(executeResolveAuthRoute('#signin?ref=email_campaign').result, 'signin')
    assert.equal(executeResolveAuthRoute('#signin&prompt=none').result, 'signin')
    assert.equal(executeResolveAuthRoute('#signin#instructions').result, 'signin')
    assert.equal(executeResolveAuthRoute('#signin?').result, 'signin')
  })

  await t.test('1.9 Adversarial injection and XSS payloads in hash fail closed or resolve safely', () => {
    // Direct script injection attempts
    assert.equal(executeResolveAuthRoute('#<script>alert(1)</script>').result, '')
    assert.equal(executeResolveAuthRoute('#javascript:alert(1)').result, '')
    assert.equal(executeResolveAuthRoute("#' OR 1=1 --").result, '')

    // Script injection disguised after signin
    assert.equal(executeResolveAuthRoute('#signin<script>alert(1)</script>').result, '')

    // Script injection inside access token payload: returns signin mode safely
    const xssToken = '#access_token=<svg/onload=alert(1)>&refresh_token=none&type=signup'
    const { result } = executeResolveAuthRoute(xssToken)
    assert.equal(result, 'signin')
    // Note: react JSX rendering in AuthPages escapes text nodes, preventing DOM execution
  })

  await t.test('1.10 Unusual prefix with access token (e.g. #signup-customer#access_token=...) normalizes', () => {
    const rawHash = '#signup-customer#access_token=token_789&type=signup'
    const win = createMockWindow(rawHash)
    const { result } = executeResolveAuthRoute(rawHash, win)

    assert.equal(result, 'signin')
    assert.equal(win.location.hash.startsWith('#access_token='), true)
  })
})

test('ADVERSARIAL SUITE 2: isOriginAllowed in server/index.mjs', async t => {
  await t.test('2.1 Non-browser or server-to-server requests (falsy origin) pass through', () => {
    assert.equal(isOriginAllowed(undefined, 'heymandiamond.com'), true)
    assert.equal(isOriginAllowed('', 'heymandiamond.com'), true)
    assert.equal(isOriginAllowed(null, 'heymandiamond.com'), true)
  })

  await t.test('2.2 String literal "null" origin is rejected', () => {
    assert.equal(isOriginAllowed('null', 'heymandiamond.com'), false)
    assert.equal(isOriginAllowed('null', 'hey-man-diamond-test.onrender.com'), false)
  })

  await t.test('2.3 Known production, custom, and local origins are allowed', () => {
    const allowed = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://hey-man-diamond-test.onrender.com',
      'https://heymandiamondllc.com',
      'https://www.heymandiamondllc.com',
      'https://heymandiamond.com',
      'https://www.heymandiamond.com',
    ]
    for (const origin of allowed) {
      assert.equal(isOriginAllowed(origin, 'heymandiamond.com'), true, `${origin} should be allowed`)
    }
  })

  await t.test('2.4 Malicious / spoofed origins are strictly rejected', () => {
    const malicious = [
      'https://evil.com',
      'https://attacker.org',
      'https://phishing-heymandiamond.com',
      'https://fakeheymandiamond.com',
    ]
    for (const origin of malicious) {
      assert.equal(isOriginAllowed(origin, 'heymandiamond.com'), false, `${origin} must be rejected`)
      assert.equal(isOriginAllowed(origin, 'hey-man-diamond-test.onrender.com'), false)
    }
  })

  await t.test('2.5 Domain suffix and prefix attack attempts are strictly rejected', () => {
    const attacks = [
      'https://heymandiamond.com.evil.com',
      'https://evil-heymandiamond.com',
      'https://heymandiamondllc.com.attacker.com',
      'https://attacker-heymandiamondllc.com',
      'https://www.heymandiamond.com.attacker.org',
      'https://notheymandiamond.com',
    ]
    for (const origin of attacks) {
      assert.equal(isOriginAllowed(origin, 'heymandiamond.com'), false, `Attack origin ${origin} must be rejected`)
    }
  })

  await t.test('2.6 Unlisted subdomains are rejected', () => {
    assert.equal(isOriginAllowed('https://api.heymandiamond.com', 'heymandiamond.com'), false)
    assert.equal(isOriginAllowed('https://admin.heymandiamond.com', 'heymandiamond.com'), false)
    assert.equal(isOriginAllowed('https://test.heymandiamondllc.com', 'heymandiamondllc.com'), false)
  })

  await t.test('2.7 Insecure HTTP protocol on production domains is rejected', () => {
    assert.equal(isOriginAllowed('http://heymandiamond.com', 'hey-man-diamond-test.onrender.com'), false)
    assert.equal(isOriginAllowed('http://heymandiamondllc.com', 'hey-man-diamond-test.onrender.com'), false)
  })

  await t.test('2.8 Same-origin requests matching Host header are allowed', () => {
    assert.equal(isOriginAllowed('https://heymandiamond.com', 'heymandiamond.com'), true)
    assert.equal(isOriginAllowed('https://heymandiamondllc.com', 'heymandiamondllc.com'), true)
    assert.equal(isOriginAllowed('http://127.0.0.1:8080', '127.0.0.1:8080'), true)
  })

  await t.test('2.9 Same-origin check fails if Origin host does not match Host header', () => {
    assert.equal(isOriginAllowed('https://evil.com', 'heymandiamond.com'), false)
    assert.equal(isOriginAllowed('https://heymandiamond.com:8443', 'heymandiamond.com'), false)
  })
})

test('ADVERSARIAL SUITE 3: getAuthRedirectUrl in server/index.mjs', async t => {
  await t.test('3.1 Fallback behavior when request object is empty or malformed', () => {
    assert.equal(getAuthRedirectUrl(), 'https://hey-man-diamond-test.onrender.com/#signin')
    assert.equal(getAuthRedirectUrl(null), 'https://hey-man-diamond-test.onrender.com/#signin')
    assert.equal(getAuthRedirectUrl({}), 'https://hey-man-diamond-test.onrender.com/#signin')
    assert.equal(getAuthRedirectUrl({ headers: {} }), 'https://hey-man-diamond-test.onrender.com/#signin')
  })

  await t.test('3.2 Legitimate Origin headers produce matching redirect URLs', () => {
    const cases = [
      { origin: 'https://heymandiamond.com', host: 'heymandiamond.com', expected: 'https://heymandiamond.com/#signin' },
      { origin: 'https://www.heymandiamond.com', host: 'www.heymandiamond.com', expected: 'https://www.heymandiamond.com/#signin' },
      { origin: 'https://heymandiamondllc.com', host: 'heymandiamondllc.com', expected: 'https://heymandiamondllc.com/#signin' },
      { origin: 'https://www.heymandiamondllc.com', host: 'www.heymandiamondllc.com', expected: 'https://www.heymandiamondllc.com/#signin' },
      { origin: 'https://hey-man-diamond-test.onrender.com', host: 'hey-man-diamond-test.onrender.com', expected: 'https://hey-man-diamond-test.onrender.com/#signin' },
    ]
    for (const c of cases) {
      const req = { headers: { origin: c.origin, host: c.host } }
      assert.equal(getAuthRedirectUrl(req), c.expected)
    }
  })

  await t.test('3.3 Trailing slashes on Origin are sanitized before appending #signin', () => {
    const req = { headers: { origin: 'https://heymandiamond.com/', host: 'heymandiamond.com' } }
    assert.equal(getAuthRedirectUrl(req), 'https://heymandiamond.com/#signin')
  })

  await t.test('3.4 Host header is used when Origin is absent (e.g. curl / direct API)', () => {
    assert.equal(getAuthRedirectUrl({ headers: { host: 'heymandiamond.com' } }), 'https://heymandiamond.com/#signin')
    assert.equal(getAuthRedirectUrl({ headers: { host: 'heymandiamondllc.com' } }), 'https://heymandiamondllc.com/#signin')
    assert.equal(getAuthRedirectUrl({ headers: { host: 'hey-man-diamond-test.onrender.com' } }), 'https://hey-man-diamond-test.onrender.com/#signin')
  })

  await t.test('3.5 Attacker Origin with legitimate Host does NOT redirect to attacker', () => {
    const req = {
      headers: {
        origin: 'https://evil.com',
        host: 'hey-man-diamond-test.onrender.com',
      },
    }
    // Origin is rejected by isOriginAllowed; fallback uses host:
    assert.equal(getAuthRedirectUrl(req), 'https://hey-man-diamond-test.onrender.com/#signin')
    assert.notEqual(getAuthRedirectUrl(req), 'https://evil.com/#signin')
  })

  await t.test('3.6 Attacker Origin attempting domain spoofing does NOT redirect to attacker', () => {
    const req = {
      headers: {
        origin: 'https://heymandiamond.com.evil.com',
        host: 'heymandiamond.com',
      },
    }
    assert.equal(getAuthRedirectUrl(req), 'https://heymandiamond.com/#signin')
  })

  await t.test('3.7 Localhost origins are preserved during local development', () => {
    const req = {
      headers: {
        origin: 'http://localhost:5173',
        host: 'localhost:3000',
      },
    }
    assert.equal(getAuthRedirectUrl(req), 'http://localhost:5173/#signin')
  })

  await t.test('3.8 Localhost Host without origin falls back to Render deployment', () => {
    const req = {
      headers: {
        host: 'localhost:3000',
      },
    }
    // Host starts with localhost, so line 77 is skipped and line 88 fallback is used:
    assert.equal(getAuthRedirectUrl(req), 'https://hey-man-diamond-test.onrender.com/#signin')
  })

  await t.test('3.9 Protocol header (x-forwarded-proto) edge cases', () => {
    const reqHttp = {
      headers: {
        host: 'heymandiamond.com',
        'x-forwarded-proto': 'http',
      },
    }
    assert.equal(getAuthRedirectUrl(reqHttp), 'http://heymandiamond.com/#signin')

    const reqHttps = {
      headers: {
        host: 'heymandiamond.com',
        'x-forwarded-proto': 'https',
      },
    }
    assert.equal(getAuthRedirectUrl(reqHttps), 'https://heymandiamond.com/#signin')
  })
})

test('ADVERSARIAL SUITE 4: getCorsHeaders Security Posture', async t => {
  await t.test('4.1 Legitimate origin reflects caller with Vary: Origin', () => {
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

  await t.test('4.2 Malicious origin is NOT reflected; defaults to ALLOWED_ORIGIN', () => {
    const req = {
      headers: {
        origin: 'https://evil.com',
        host: 'hey-man-diamond-test.onrender.com',
      },
    }
    const cors = getCorsHeaders(req)
    assert.notEqual(cors['Access-Control-Allow-Origin'], 'https://evil.com')
  })

  await t.test('4.3 Credentials header is NOT present (prevents ambient credential theft)', () => {
    const req = {
      headers: {
        origin: 'https://heymandiamond.com',
        host: 'heymandiamond.com',
      },
    }
    const cors = getCorsHeaders(req)
    assert.equal(cors['Access-Control-Allow-Credentials'], undefined)
  })
})

test('ADVERSARIAL SUITE 5: Extreme Stress & ReDoS Resistance', async t => {
  await t.test('5.1 Survives 100,000 character hash fragment without ReDoS or lag', () => {
    const hugeHash = '#signin' + 'A'.repeat(100000)
    const t0 = performance.now()
    const { result } = executeResolveAuthRoute(hugeHash)
    const elapsed = performance.now() - t0

    assert.equal(result, '')
    assert.ok(elapsed < 20, `Execution took ${elapsed}ms, should be <20ms`)
  })

  await t.test('5.2 Survives 100,000 character token fragment with linear extraction', () => {
    const hugeToken = '#signin#access_token=' + 'T'.repeat(100000) + '&type=signup'
    const win = createMockWindow(hugeToken)
    const t0 = performance.now()
    const { result } = executeResolveAuthRoute(hugeToken, win)
    const elapsed = performance.now() - t0

    assert.equal(result, 'signin')
    assert.ok(win.location.hash.startsWith('#access_token=TTTT'))
    assert.ok(elapsed < 20, `Execution took ${elapsed}ms, should be <20ms`)
  })

  await t.test('5.3 Unicode, emojis, and URL-encoded characters in hash handle cleanly', () => {
    // Contains 'access_token=' so resolveAuthRoute routes to signin as expected for any auth callback
    assert.equal(executeResolveAuthRoute('#signin%23access_token=123').result, 'signin')
    // Non-auth unicode and emojis return empty string
    assert.equal(executeResolveAuthRoute('#💎heymandiamond').result, '')
    assert.equal(executeResolveAuthRoute('#\u200Bsignin').result, '') // zero-width space
  })

  await t.test('5.4 Prototype pollution payload in headers does not crash getAuthRedirectUrl or getCorsHeaders', () => {
    const poisonedHeaders = Object.create(null)
    poisonedHeaders.__proto__ = 'malicious'
    poisonedHeaders.constructor = 'malicious'
    poisonedHeaders.origin = 'https://heymandiamond.com'
    poisonedHeaders.host = 'heymandiamond.com'

    const req = { headers: poisonedHeaders }
    assert.equal(getAuthRedirectUrl(req), 'https://heymandiamond.com/#signin')
    const cors = getCorsHeaders(req)
    assert.equal(cors['Access-Control-Allow-Origin'], 'https://heymandiamond.com')
  })

  await t.test('5.5 Host with port (e.g. heymandiamond.com:443) formats redirect URL safely', () => {
    const req = {
      headers: {
        host: 'heymandiamond.com:443',
      },
    }
    assert.equal(getAuthRedirectUrl(req), 'https://heymandiamond.com:443/#signin')
  })
})

