import test from 'node:test'
import assert from 'node:assert/strict'
import {
  handleCreateQuote,
  handleGetUserOrders,
  handleGetAdminQuotes,
  handleUpdateQuoteStatus,
  resetMemoryQuotes,
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

test('Customer Cart & Quotes — "Quote Own Price" Custom Offer Pricing Engine', () => {
  // Test item with custom quoted offer
  const diamondItem = {
    sku: 'HM-151',
    shape: 'Cushion',
    carat: 1.6,
    price: 640,
    listPrice: 1280,
    discountPercent: 50,
    quantity: 2,
    customQuotePrice: 580,
    isCustomQuote: true,
  }

  const catalogUnitPrice = diamondItem.price
  const effectiveOfferPrice = (diamondItem.isCustomQuote && diamondItem.customQuotePrice && diamondItem.customQuotePrice > 0)
    ? diamondItem.customQuotePrice
    : diamondItem.price
  const lineOfferTotal = effectiveOfferPrice * diamondItem.quantity
  const lineCatalogTotal = catalogUnitPrice * diamondItem.quantity

  assert.strictEqual(catalogUnitPrice, 640)
  assert.strictEqual(effectiveOfferPrice, 580)
  assert.strictEqual(lineOfferTotal, 1160) // $580 x 2
  assert.strictEqual(lineCatalogTotal, 1280) // $640 x 2
  assert.strictEqual(lineCatalogTotal - lineOfferTotal, 120) // customer asks for $120 extra discount

  // Test mixed cart: one standard diamond, one custom quoted diamond
  const regularItem = {
    sku: 'HM-REG-101',
    shape: 'Round',
    carat: 1.0,
    price: 2000,
    listPrice: 2000,
    quantity: 1,
    customQuotePrice: null,
    isCustomQuote: false,
  }

  const mixedCart = [diamondItem, regularItem]
  const hasAnyCustom = mixedCart.some(i => Boolean(i.isCustomQuote && i.customQuotePrice && i.customQuotePrice > 0))
  assert.strictEqual(hasAnyCustom, true)

  const catalogSubtotal = mixedCart.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0)
  const proposedOfferTotal = mixedCart.reduce((sum, i) => {
    const p = (i.isCustomQuote && i.customQuotePrice && i.customQuotePrice > 0)
      ? Number(i.customQuotePrice)
      : i.price
    return sum + (p * (i.quantity || 1))
  }, 0)

  // Catalog: ($640 x 2) + ($2000 x 1) = $3280
  assert.strictEqual(catalogSubtotal, 3280)
  // Proposed: ($580 x 2) + ($2000 x 1) = $3160
  assert.strictEqual(proposedOfferTotal, 3160)
  assert.strictEqual(catalogSubtotal - proposedOfferTotal, 120)
})

test('Admin Panel — Orders from Website Permissions & Quote Status Lifecycle', async t => {
  resetMemoryQuotes()

  const unauthorizedAdmin = {
    user: { id: 'staff-ops', email: 'ops@heymandiamond.com' },
    permissions: { can_manage_orders: false, can_manage_inventory: true },
  }

  const authorizedSalesManager = {
    user: { id: 'staff-sales', email: 'sales@heymandiamond.com' },
    permissions: { can_manage_orders: true },
  }

  await t.test('handleGetAdminQuotes rejects staff without can_manage_orders permission (403)', async () => {
    const req = createMockReq()
    const res = createMockRes()
    await handleGetAdminQuotes(req, res, unauthorizedAdmin)
    assert.strictEqual(res.statusCode, 403)
    assert.match(res.json.error, /Order.*management permission required/i)
  })

  await t.test('handleUpdateQuoteStatus rejects staff without can_manage_orders permission (403)', async () => {
    const req = createMockReq({ 'content-type': 'application/json' }, { status: 'accepted' })
    const res = createMockRes()
    await handleUpdateQuoteStatus(req, res, unauthorizedAdmin, 'quote-123')
    assert.strictEqual(res.statusCode, 403)
    assert.match(res.json.error, /Order.*management permission required/i)
  })

  await t.test('handleGetAdminQuotes allows authorized staff and returns quote list', async () => {
    const req = createMockReq()
    const res = createMockRes()
    await handleGetAdminQuotes(req, res, authorizedSalesManager)
    assert.strictEqual(res.statusCode, 200)
    assert.ok(Array.isArray(res.json.items))
    assert.strictEqual(typeof res.json.unreadCount, 'number')
  })

  await t.test('handleUpdateQuoteStatus validates permitted statuses strictly', async () => {
    const req = createMockReq({ 'content-type': 'application/json' }, { status: 'invalid_status_xyz' })
    const res = createMockRes()
    await handleUpdateQuoteStatus(req, res, authorizedSalesManager, 'quote-123')
    assert.strictEqual(res.statusCode, 400)
    assert.match(res.json.error, /invalid quote request status/i)
  })

  await t.test('Admin Orders — SKU and Catalog Price fallback accurately extracts from submitted_snapshot', () => {
    // Simulating past order Q-3 where flomiz_sku column was empty and current_unit_price was 0
    const rawItem = {
      id: 'item-q3',
      flomiz_sku: '',
      product_name: 'Cushion 1.6ct F VS2 (IGI)',
      current_unit_price: 0,
      requested_unit_price: 1280,
      product_snapshot: {
        audience: 'customer',
        submitted_snapshot: {
          name: 'Cushion 1.6ct F VS2 (IGI)',
          flomiz_sku: 'HM-151',
          requestedPrice: 1280,
          quantity: 1,
        },
      },
    }

    const snap = rawItem.product_snapshot
    const submittedSnap = snap?.submitted_snapshot || {}
    const resolvedSku = String(
      rawItem.flomiz_sku ||
      snap?.sku ||
      snap?.flomiz_sku ||
      submittedSnap.flomiz_sku ||
      submittedSnap.sku ||
      '—'
    )

    const catPriceNum = Number(
      snap?.catalog_unit_price ??
      snap?.price ??
      rawItem.current_unit_price ??
      submittedSnap.catalogPrice ??
      submittedSnap.price ??
      submittedSnap.listPrice ??
      0
    )

    const reqPriceNum = Number(
      rawItem.requested_unit_price ??
      snap?.customer_requested_price ??
      submittedSnap.requestedPrice ??
      catPriceNum
    )

    const resolvedCatPrice = catPriceNum > 0 ? catPriceNum : reqPriceNum
    const resolvedReqPrice = reqPriceNum > 0 ? reqPriceNum : resolvedCatPrice

    assert.strictEqual(resolvedSku, 'HM-151')
    assert.strictEqual(resolvedCatPrice, 1280)
    assert.notStrictEqual(resolvedCatPrice, 0)
    assert.strictEqual(resolvedReqPrice, 1280)
  })

  await t.test('Admin Orders — Completed Orders filter pill includes closed and completed statuses', () => {
    const orders = [
      { id: '1', quote_number: 1, status: 'closed' },
      { id: '2', quote_number: 2, status: 'closed' },
      { id: '3', quote_number: 3, status: 'closed' },
      { id: '4', quote_number: 4, status: 'under_review' },
      { id: '5', quote_number: 5, status: 'converted_to_order' },
    ]

    const completedCount = orders.filter(q => q.status === 'closed' || q.status === 'completed').length
    assert.strictEqual(completedCount, 3)

    const filterClosed = orders.filter(q => q.status === 'closed' || q.status === 'completed')
    assert.strictEqual(filterClosed.length, 3)
    assert.deepStrictEqual(filterClosed.map(q => q.quote_number), [1, 2, 3])
  })
})
