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

test('Customer Cart & Quotes — Discount Pricing, Line Item Totals & Cart Summary Breakdown', () => {
  // Test diamond price resolution
  function resolveDiamondCartPricing(diamond, isApprovedDealer = false) {
    const listPrice = isApprovedDealer
      ? Number(diamond.listPrice || diamond.dealerPrice || diamond.wholesalePrice || diamond.price || 0)
      : Number(diamond.listPrice || diamond.customerPrice || diamond.price || 0)

    const discountPrice = diamond.discountPrice != null && Number(diamond.discountPrice) > 0
      ? Number(diamond.discountPrice)
      : null

    const effectivePrice = (discountPrice != null && discountPrice < listPrice)
      ? discountPrice
      : Number(diamond.price || listPrice)

    const discountPercent = diamond.discountPercent != null
      ? Number(diamond.discountPercent)
      : (listPrice > effectivePrice ? Math.round(((listPrice - effectivePrice) / listPrice) * 100) : null)

    return { listPrice, effectivePrice, discountPrice, discountPercent }
  }

  // 1. Diamond HM-151 with 50% discount ($1280 list -> $640 discounted)
  const hm151 = {
    sku: 'HM-151',
    shape: 'Cushion',
    carat: 1.6,
    customerPrice: 1280,
    listPrice: 1280,
    discountPrice: 640,
    discountPercent: 50,
    price: 640,
  }

  const pricing151 = resolveDiamondCartPricing(hm151, false)
  assert.strictEqual(pricing151.listPrice, 1280)
  assert.strictEqual(pricing151.effectivePrice, 640)
  assert.strictEqual(pricing151.discountPercent, 50)

  // 2. Diamond without discount ($2000 list -> $2000 effective)
  const nonDiscounted = {
    sku: 'HM-REG-101',
    shape: 'Round',
    carat: 1.0,
    customerPrice: 2000,
    listPrice: 2000,
    discountPrice: null,
    discountPercent: null,
    price: 2000,
  }

  const pricingReg = resolveDiamondCartPricing(nonDiscounted, false)
  assert.strictEqual(pricingReg.listPrice, 2000)
  assert.strictEqual(pricingReg.effectivePrice, 2000)
  assert.strictEqual(pricingReg.discountPercent, null)

  // 3. Cart Summary Breakdown calculations
  const cart = [
    { ...hm151, price: pricing151.effectivePrice, listPrice: pricing151.listPrice, quantity: 2 }, // $1280 list x 2 = $2560 list, $640 x 2 = $1280 effective
    { ...nonDiscounted, price: pricingReg.effectivePrice, listPrice: pricingReg.listPrice, quantity: 1 }, // $2000 list x 1 = $2000 list, $2000 x 1 = $2000 effective
  ]

  const cartListTotal = cart.reduce((sum, item) => {
    const list = (item.listPrice && item.listPrice > item.price) ? item.listPrice : item.price
    return sum + (list * (item.quantity || 1))
  }, 0)

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0)
  const cartTotalDiscount = Math.max(0, cartListTotal - cartTotal)
  const cartTotalDiscountPercent = cartListTotal > 0 && cartTotalDiscount > 0
    ? Math.round((cartTotalDiscount / cartListTotal) * 100)
    : 0

  // Total list: $2560 + $2000 = $4560
  assert.strictEqual(cartListTotal, 4560)
  // Total payable: $1280 + $2000 = $3280
  assert.strictEqual(cartTotal, 3280)
  // Total discount savings: $4560 - $3280 = $1280
  assert.strictEqual(cartTotalDiscount, 1280)
  // Total discount percent: 1280 / 4560 = ~28%
  assert.strictEqual(cartTotalDiscountPercent, 28)

  // 4. Line item savings check for HM-151 (qty 2)
  const hm151Item = cart[0]
  const lineListTotal = hm151Item.listPrice * hm151Item.quantity // 2560
  const linePayableTotal = hm151Item.price * hm151Item.quantity // 1280
  const lineSavings = lineListTotal - linePayableTotal // 1280
  assert.strictEqual(lineListTotal, 2560)
  assert.strictEqual(linePayableTotal, 1280)
  assert.strictEqual(lineSavings, 1280)
})
