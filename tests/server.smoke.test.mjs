import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const port = 43187
const origin = 'http://localhost:5173'
let server

test('API smoke checks', async t => {
  server = spawn(process.execPath, ['server/index.mjs'], {
    env: { ...process.env, API_PORT: String(port), ALLOWED_ORIGIN: origin, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', FLOMIZ_CUSTOMER_ID: '' },
    stdio: 'ignore',
  })
  t.after(() => { if (server && !server.killed) server.kill('SIGTERM') })

  let ready = false
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (response.ok) { ready = true; break }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal(ready, true, 'API server should start')

  await t.test('health endpoint reveals configuration status only', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Origin: origin } })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.status, 'ok')
    assert.equal(body.databaseConfigured, false)
    assert.equal(JSON.stringify(body).includes('SERVICE_ROLE'), false)
  })

  await t.test('rejects unapproved browser origins', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Origin: 'https://attacker.example' } })
    assert.equal(response.status, 403)
  })

  await t.test('admin endpoints reject unauthenticated requests', async () => {
    for (const path of ['/api/admin/orders', '/api/admin/reviews', '/api/admin/dealer-applications', '/api/admin/promotions']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { Origin: origin } })
      assert.equal(response.status, 401, path + ' should require an authenticated admin')
    }
  })

  await t.test('quotes require an authenticated account', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/quotes`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', items: [{ sku: 'x', name: 'Diamond', requestedPrice: 100 }] }),
    })
    assert.equal(response.status, 401)
  })

  await t.test('catalog stays unavailable until Flomiz is configured', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/catalog`, { headers: { Origin: origin } })
    assert.equal(response.status, 503)
  })

  await t.test('rejects malformed JSON with a client error', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/reviews`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: '{not-json',
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'Request body must be valid JSON.' })
  })

  await t.test('rejects oversized request bodies', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/reviews`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ remarks: 'x'.repeat(21000) }),
    })
    assert.equal(response.status, 413)
    assert.deepEqual(await response.json(), { error: 'Request body is too large.' })
  })

  await t.test('inquiries fail closed until the database is configured', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/inquiries`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', email: 'test@example.com', message: 'test' }),
    })
    assert.equal(response.status, 503)
  })
})
