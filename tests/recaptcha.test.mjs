import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyRecaptchaToken, handleSignup, handleSignin } from '../server/services/auth.mjs'
import { CSP_HEADER } from '../server/services/shared.mjs'
import fs from 'node:fs'
import path from 'node:path'

function createMockReq(body = {}, headers = {}) {
  const payload = JSON.stringify(body)
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payload)),
      host: 'localhost:5173',
      origin: 'http://localhost:5173',
      ...headers,
    },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(payload)
    },
  }
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(status, headers) {
      res.statusCode = status
      Object.assign(res.headers, headers)
      return res
    },
    end(data) {
      if (data) res.body += data
      return res
    },
  }
  return res
}

test('reCAPTCHA v2 Suite — Security and Lifecycle Protocol', async (t) => {
  await t.test('1. verifyRecaptchaToken returns error when token is missing', async () => {
    process.env.RECAPTCHA_ENFORCE = 'true'
    try {
      const result = await verifyRecaptchaToken('', '127.0.0.1')
      assert.equal(result.success, false)
      assert.match(result.error, /verify that you are human/i)
    } finally {
      delete process.env.RECAPTCHA_ENFORCE
    }
  })

  await t.test('2. verifyRecaptchaToken succeeds for mock valid token', async () => {
    const result = await verifyRecaptchaToken('mock-valid-token', '127.0.0.1')
    assert.equal(result.success, true)
  })

  await t.test('3. verifyRecaptchaToken fails for mock invalid token', async () => {
    const result = await verifyRecaptchaToken('mock-invalid-token', '127.0.0.1')
    assert.equal(result.success, false)
    assert.match(result.error, /CAPTCHA verification failed/i)
  })

  await t.test('4. handleSignup rejects requests with invalid CAPTCHA token', async () => {
    process.env.RECAPTCHA_ENFORCE = 'true'
    try {
      const req = createMockReq({
        email: 'newuser@example.com',
        password: 'Password123!',
        fullName: 'New User',
        phone: '555-123-4567',
        address: '123 Main St',
        captchaToken: 'mock-invalid-token',
      })
      const res = createMockRes()
      await handleSignup(req, res)
      assert.equal(res.statusCode, 400)
      const data = JSON.parse(res.body)
      assert.match(data.error, /CAPTCHA verification failed/i)
    } finally {
      delete process.env.RECAPTCHA_ENFORCE
    }
  })

  await t.test('5. handleSignin rejects requests with invalid CAPTCHA token', async () => {
    process.env.RECAPTCHA_ENFORCE = 'true'
    try {
      const req = createMockReq({
        email: 'user@example.com',
        password: 'Password123!',
        captchaToken: 'mock-invalid-token',
      })
      const res = createMockRes()
      await handleSignin(req, res)
      assert.equal(res.statusCode, 400)
      const data = JSON.parse(res.body)
      assert.match(data.error, /CAPTCHA verification failed/i)
    } finally {
      delete process.env.RECAPTCHA_ENFORCE
    }
  })

  await t.test('6. Content-Security-Policy header includes Google reCAPTCHA domains', () => {
    assert.ok(CSP_HEADER.includes('https://www.google.com/recaptcha/'), 'CSP script-src must allow Google reCAPTCHA')
    assert.ok(CSP_HEADER.includes('https://www.gstatic.com/recaptcha/'), 'CSP script-src must allow Google gstatic reCAPTCHA')
    assert.ok(CSP_HEADER.includes('https://recaptcha.google.com/recaptcha/'), 'CSP frame-src must allow Google reCAPTCHA frames')
  })

  await t.test('7. index.html contains the Google reCAPTCHA v2 script tag', () => {
    const htmlPath = path.resolve('index.html')
    const html = fs.readFileSync(htmlPath, 'utf8')
    assert.ok(html.includes('https://www.google.com/recaptcha/api.js?render=explicit'), 'index.html must load reCAPTCHA API script')
    assert.ok(html.includes('id="recaptcha-script"'), 'reCAPTCHA script must have recaptcha-script id')
  })
})
