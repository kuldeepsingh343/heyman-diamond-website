import test from 'node:test'
import assert from 'node:assert/strict'
import {
  handleCheckRegistered,
  handleGetProfile,
  handleSignup,
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

  await t.test('recognizes staff emails as registered', async () => {
    let statusCode = 200
    let payload = null
    const res = {
      writeHead(code) { statusCode = code },
      end(body) { payload = JSON.parse(body) },
    }
    const url = new URL('http://localhost/api/auth/check-registered?email=kuldeepsingh343@gmail.com')
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

