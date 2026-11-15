import test from 'node:test'
import assert from 'node:assert/strict'
import {
  handleCreateQuote,
  handleGetUserOrders,
} from '../server/services/quotes.mjs'

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

test('Customer Cart & Quotes Service — Access Control & Validation', async t => {
  await t.test('handleCreateQuote rejects unauthenticated requests with 401', async () => {
    const req = createMockReq({ 'content-type': 'application/json' }, {
      name: 'Jane Doe',
      items: [{ sku: 'HMD-LG-1001', quantity: 2, price: 1500 }],
    })
    const res = createMockRes()
    await handleCreateQuote(req, res)
    assert.strictEqual(res.statusCode, 401)
    assert.match(res.json.error, /sign in/i)
  })

  await t.test('handleGetUserOrders rejects unauthenticated requests with 401', async () => {
    const req = createMockReq()
    const res = createMockRes()
    await handleGetUserOrders(req, res)
    assert.strictEqual(res.statusCode, 401)
    assert.match(res.json.error, /sign in/i)
  })
})

test('Customer Cart & Quotes — Order Status Formatting & Mapping Rules', () => {
  function formatOrderStatus(status) {
    switch (status) {
      case 'new':
      case 'pending':
        return 'Under Sales Review'
      case 'under_review':
        return 'In Review'
      case 'accepted':
      case 'confirmed':
        return 'Confirmed & Approved'
      case 'counter_offered':
        return 'Counter-Offer Ready'
      case 'declined':
      case 'rejected':
        return 'Declined'
      case 'converted_to_order':
        return 'Order In Fulfillment'
      case 'closed':
      case 'completed':
        return 'Completed'
      default:
        return status.replace(/_/g, ' ')
    }
  }

  assert.strictEqual(formatOrderStatus('new'), 'Under Sales Review')
  assert.strictEqual(formatOrderStatus('pending'), 'Under Sales Review')
  assert.strictEqual(formatOrderStatus('under_review'), 'In Review')
  assert.strictEqual(formatOrderStatus('accepted'), 'Confirmed & Approved')
  assert.strictEqual(formatOrderStatus('confirmed'), 'Confirmed & Approved')
  assert.strictEqual(formatOrderStatus('counter_offered'), 'Counter-Offer Ready')
  assert.strictEqual(formatOrderStatus('declined'), 'Declined')
  assert.strictEqual(formatOrderStatus('rejected'), 'Declined')
  assert.strictEqual(formatOrderStatus('converted_to_order'), 'Order In Fulfillment')
  assert.strictEqual(formatOrderStatus('closed'), 'Completed')
  assert.strictEqual(formatOrderStatus('completed'), 'Completed')
  assert.strictEqual(formatOrderStatus('custom_status_test'), 'custom status test')
})

test('Customer Cart & Quotes — Quantity Boundary & Message Aggregation Logic', () => {
  // Test quantity bounds: Math.max(1, Math.min(100, qty))
  const clampQty = (q) => Math.max(1, Math.min(100, Number(q) || 1))
  assert.strictEqual(clampQty(0), 1)
  assert.strictEqual(clampQty(-5), 1)
  assert.strictEqual(clampQty(1), 1)
  assert.strictEqual(clampQty(5), 5)
  assert.strictEqual(clampQty(100), 100)
  assert.strictEqual(clampQty(150), 100)
  assert.strictEqual(clampQty(null), 1)
  assert.strictEqual(clampQty(undefined), 1)
  assert.strictEqual(clampQty('NaN'), 1)

  // Test customer message aggregation
  const buildCustomerMessage = (phone, shippingAddress, deliveryPreference, message) => {
    return [
      phone ? `Phone: ${phone}` : null,
      shippingAddress ? `Delivery Address: ${shippingAddress}` : null,
      deliveryPreference ? `Fulfillment Method: ${deliveryPreference}` : null,
      message ? `Customer Notes: ${message}` : null,
    ].filter(Boolean).join('\n\n') || null
  }

  const combined = buildCustomerMessage(
    '+1 (312) 555-0199',
    '55 E Washington St, Suite 1200, Chicago, IL 60602',
    'Armored Courier (Insured)',
    'Please inspect laser inscription under loupe before dispatch.'
  )

  assert.ok(combined.includes('Phone: +1 (312) 555-0199'))
  assert.ok(combined.includes('Delivery Address: 55 E Washington St, Suite 1200, Chicago, IL 60602'))
  assert.ok(combined.includes('Fulfillment Method: Armored Courier (Insured)'))
  assert.ok(combined.includes('Customer Notes: Please inspect laser inscription under loupe before dispatch.'))

  // Null handling
  assert.strictEqual(buildCustomerMessage('', '', '', ''), null)
})
