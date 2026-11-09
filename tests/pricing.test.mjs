import test from 'node:test'
import assert from 'node:assert/strict'

process.env.FLOMIZ_API_KEY = 'test_flomiz_key'

import {
  roundMoney,
  roundPercent,
  computeDiscount,
  processDiamondPricingUpdates,
} from '../server/services/pricing.mjs'

import {
  handleUpdateAdminDiamond,
  handleGetCatalog,
  getEffectiveDiamondPrice,
} from '../server/services/inventory.mjs'

import {
  handleCreateQuote,
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

test('Pricing Engine — roundMoney & roundPercent', () => {
  assert.strictEqual(roundMoney(1850), 1850)
  assert.strictEqual(roundMoney(1850.556), 1850.56)
  assert.strictEqual(roundMoney('1480.00'), 1480)
  assert.strictEqual(roundPercent(20), 20)
  assert.strictEqual(roundPercent(33.3333), 33.33)

  assert.throws(() => roundMoney(NaN), TypeError)
  assert.throws(() => roundMoney(Infinity), TypeError)
  assert.throws(() => roundMoney('not-a-number'), TypeError)
})

test('Pricing Engine — computeDiscount from Discount Price', () => {
  const result = computeDiscount(1850, 1480, null)
  assert.strictEqual(result.discountPrice, 1480)
  assert.strictEqual(result.discountPercent, 20)
  assert.strictEqual(result.effectivePrice, 1480)

  const res2 = computeDiscount(1000, '750', '')
  assert.strictEqual(res2.discountPrice, 750)
  assert.strictEqual(res2.discountPercent, 25)
  assert.strictEqual(res2.effectivePrice, 750)
})

test('Pricing Engine — computeDiscount from Discount Percent', () => {
  const result = computeDiscount(1850, null, 20)
  assert.strictEqual(result.discountPrice, 1480)
  assert.strictEqual(result.discountPercent, 20)
  assert.strictEqual(result.effectivePrice, 1480)

  const res2 = computeDiscount(100, '', '15.5')
  assert.strictEqual(res2.discountPrice, 84.5)
  assert.strictEqual(res2.discountPercent, 15.5)
  assert.strictEqual(res2.effectivePrice, 84.5)
})

test('Pricing Engine — Discount Price wins when both are provided', () => {
  const result = computeDiscount(1000, 800, 50)
  assert.strictEqual(result.discountPrice, 800)
  assert.strictEqual(result.discountPercent, 20)
  assert.strictEqual(result.effectivePrice, 800)
})

test('Pricing Engine — Clearing discount', () => {
  const res1 = computeDiscount(1850, null, null)
  assert.strictEqual(res1.discountPrice, null)
  assert.strictEqual(res1.discountPercent, null)
  assert.strictEqual(res1.effectivePrice, 1850)

  const res2 = computeDiscount(1850, '', '')
  assert.strictEqual(res2.discountPrice, null)
  assert.strictEqual(res2.discountPercent, null)
  assert.strictEqual(res2.effectivePrice, 1850)

  const res3 = computeDiscount(1850, 0, null)
  assert.strictEqual(res3.discountPrice, null)
  assert.strictEqual(res3.discountPercent, null)
  assert.strictEqual(res3.effectivePrice, 1850)

  const res4 = computeDiscount(1850, null, 0)
  assert.strictEqual(res4.discountPrice, null)
  assert.strictEqual(res4.discountPercent, null)
  assert.strictEqual(res4.effectivePrice, 1850)
})

test('Pricing Engine — Strict Validation & Boundary Edge Cases', () => {
  assert.throws(() => computeDiscount(0, 10, null), RangeError)
  assert.throws(() => computeDiscount(-100, 10, null), RangeError)
  assert.throws(() => computeDiscount(NaN, 10, null), RangeError)
  assert.throws(() => computeDiscount(Infinity, 10, null), RangeError)

  assert.throws(() => computeDiscount(1000, 1000, null), RangeError)
  assert.throws(() => computeDiscount(1000, 1200, null), RangeError)
  assert.throws(() => computeDiscount(1000, -50, null), RangeError)
  assert.throws(() => computeDiscount(1000, 'abc', null), TypeError)

  assert.throws(() => computeDiscount(1000, null, 100), RangeError)
  assert.throws(() => computeDiscount(1000, null, 105), RangeError)
  assert.throws(() => computeDiscount(1000, null, -10), RangeError)
  assert.throws(() => computeDiscount(1000, null, 'invalid'), TypeError)
})

test('Pricing Engine — processDiamondPricingUpdates dual-audience handling', () => {
  const current = {
    customer_price: 2000,
    dealer_price: 1500,
    customer_discount_price: null,
    customer_discount_percent: null,
    dealer_discount_price: null,
    dealer_discount_percent: null,
  }

  const updates = processDiamondPricingUpdates(current, {
    customerDiscountPercent: 10,
    dealerDiscountPrice: 1200,
  })

  assert.strictEqual(updates.customer_price, 2000)
  assert.strictEqual(updates.customer_discount_price, 1800)
  assert.strictEqual(updates.customer_discount_percent, 10)

  assert.strictEqual(updates.dealer_price, 1500)
  assert.strictEqual(updates.dealer_discount_price, 1200)
  assert.strictEqual(updates.dealer_discount_percent, 20)
})

test('Pricing API — Access control and permission boundaries', async () => {
  const reqNoAuth = createMockReq({}, { customerDiscountPercent: 20 })
  const resNoAuth = createMockRes()
  await handleUpdateAdminDiamond(reqNoAuth, resNoAuth, null, 'HMD-LG-1001')
  assert.strictEqual(resNoAuth.statusCode, 401)

  const adminNoPerm = {
    user: { id: 'admin-1', email: 'sales@heymandiamond.com' },
    permissions: { can_manage_inventory: false },
  }
  const reqNoPerm = createMockReq({}, { customerDiscountPercent: 20 })
  const resNoPerm = createMockRes()
  await handleUpdateAdminDiamond(reqNoPerm, resNoPerm, adminNoPerm, 'HMD-LG-1001')
  assert.strictEqual(resNoPerm.statusCode, 403)
})

test('Pricing API — Rejects invalid discount price (greater than or equal to list)', async () => {
  const admin = {
    user: { id: 'admin-1', email: 'admin@heymandiamond.com' },
    permissions: { can_manage_inventory: true },
  }
  // List price of HMD-LG-1001 is 1850; try to set discount price = 2000
  const req = createMockReq({}, { customerDiscountPrice: 2000 })
  const res = createMockRes()
  await handleUpdateAdminDiamond(req, res, admin, 'HMD-LG-1001')
  assert.strictEqual(res.statusCode, 400)
  assert.match(res.json.error, /less than list price/i)
})

test('Pricing API — Strict Audience Isolation in Catalog responses', async () => {
  // 1. Anonymous / Retail Customer request
  const anonUrl = new URL('http://localhost:3000/api/catalog?perPage=10')
  const anonReq = createMockReq()
  const anonRes = createMockRes()
  await handleGetCatalog(anonReq, anonRes, anonUrl, null)

  assert.strictEqual(anonRes.statusCode, 200)
  const anonItems = anonRes.json.items
  assert.ok(anonItems.length > 0)
  for (const item of anonItems) {
    // Retail customer MUST NEVER see wholesale / dealer fields
    assert.strictEqual(item.wholesalePrice, undefined, 'Customer must not see wholesalePrice')
    assert.strictEqual(item.dealerPrice, undefined, 'Customer must not see dealerPrice')
    assert.strictEqual(item.dealerDiscountPrice, undefined, 'Customer must not see dealerDiscountPrice')
    assert.strictEqual(item.dealerDiscountPercent, undefined, 'Customer must not see dealerDiscountPercent')
  }

  // 2. Approved Dealer request
  const dealerUser = {
    id: 'dealer-123',
    account_type: 'dealer',
    dealer_status: 'approved',
  }
  const dealerUrl = new URL('http://localhost:3000/api/catalog?perPage=10')
  const dealerReq = createMockReq()
  const dealerRes = createMockRes()
  await handleGetCatalog(dealerReq, dealerRes, dealerUrl, dealerUser)

  assert.strictEqual(dealerRes.statusCode, 200)
  const dealerItems = dealerRes.json.items
  assert.ok(dealerItems.length > 0)
  for (const item of dealerItems) {
    // Approved Dealer MUST NOT see retail customer price or customer discount fields
    assert.strictEqual(item.customerPrice, undefined, 'Dealer must not receive customerPrice')
    assert.strictEqual(item.customerDiscountPrice, undefined, 'Dealer must not receive customerDiscountPrice')
    assert.strictEqual(item.customerDiscountPercent, undefined, 'Dealer must not receive customerDiscountPercent')
    // Must see dealer price
    assert.ok(item.dealerPrice !== undefined || item.wholesalePrice !== undefined)
  }
})

test('Pricing & Quotes — Server authoritative effective price snapshotting', async () => {
  // HMD-LG-1001 list is 1850 with 20% discount => 1480 for retail customer
  const custPrice = await getEffectiveDiamondPrice('HMD-LG-1001', false)
  assert.strictEqual(custPrice, 1480)

  // HMD-LG-1001 wholesale list is 1350 with 20% discount => 1080 for dealer
  const dealerPrice = await getEffectiveDiamondPrice('HMD-LG-1001', true)
  assert.strictEqual(dealerPrice, 1080)

  // HMD-LG-1002 has no discount; customer list is 2650, wholesale is 1950
  const custPrice2 = await getEffectiveDiamondPrice('HMD-LG-1002', false)
  assert.strictEqual(custPrice2, 2650)
  const dealerPrice2 = await getEffectiveDiamondPrice('HMD-LG-1002', true)
  assert.strictEqual(dealerPrice2, 1950)
})
