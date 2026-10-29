import { createServer } from 'node:http'

const PORT = Number(process.env.API_PORT || 3000)
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '')
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const FLOMIZ_URL = process.env.FLOMIZ_STOCK_SUMMARY_URL || 'https://diamond.flomiz.com/FAccount/API/StockSummary/GetData_2.aspx'
const FLOMIZ_CUSTOMER_ID = process.env.FLOMIZ_CUSTOMER_ID
const FLOMIZ_PORTAL_TYPE = Number(process.env.FLOMIZ_PORTAL_TYPE || 1000)
const FLOMIZ_API_USERNAME = process.env.FLOMIZ_API_USERNAME
const FLOMIZ_API_PASSWORD = process.env.FLOMIZ_API_PASSWORD

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173'
const headers = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Vary': 'Origin',
}
const reviewRate = new Map()

function json(res, status, body) {
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}
async function bodyJson(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 20000) throw new Error('Request body too large')
  }
  return JSON.parse(raw || '{}')
}
function supabaseReady() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
}
async function db(path, options = {}) {
  if (!supabaseReady()) throw new Error('Database API is not configured')
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Database request failed (${response.status}): ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}
async function authenticatedUser(req) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  return response.json()
}
async function requireAdmin(req) {
  const user = await authenticatedUser(req)
  if (!user?.id) return null
  const rows = await db(`admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id,can_review_kyc,can_manage_orders,can_manage_promotions`)
  return rows?.[0] ? { user, permissions: rows[0] } : null
}
function publicProduct(product) {
  const image = Array.isArray(product.lstImages) ? product.lstImages[0] : null
  return {
    sku: String(product.SKU || ''),
    name: String(product.ProductName || ''),
    category: String(product.CategoryName || ''),
    lab: String(product.Lab || image?.Lab || ''),
    shape: String(image?.Shape || ''),
    carat: Number(image?.['Rep Size'] || 0) || null,
    color: String(image?.Color || ''),
    clarity: String(image?.Clarity || ''),
    cut: String(image?.CUT || ''),
    polish: String(image?.POL || ''),
    symmetry: String(image?.SYM || ''),
    certificateNumber: String(image?.CertificateNo || ''),
    available: String(product.AvailableForSale || '').toLowerCase() === 'true' || Number(product.AvailableForSale) > 0,
    // Prices are intentionally omitted until business approves the display policy.
    imageData: image?.base64FileByte || null,
  }
}
const server = createServer(async (req, res) => {
  const requestOrigin = req.headers.origin
  if (requestOrigin && requestOrigin !== ALLOWED_ORIGIN) {
    return json(res, 403, { error: 'This website origin is not allowed.' })
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers)
    return res.end()
  }
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, {
        status: 'ok',
        databaseConfigured: supabaseReady(),
        flomizConfigured: Boolean(FLOMIZ_CUSTOMER_ID),
        note: 'Configuration presence only; provider credentials and connectivity are not verified by this endpoint.',
      })
    }

    if (req.method === 'GET' && url.pathname === '/api/catalog') {
      if (!FLOMIZ_CUSTOMER_ID) return json(res, 503, { error: 'Diamond inventory is not connected yet.' })
      const page = Math.max(1, Math.min(10000, Number(url.searchParams.get('page') || 1)))
      const perPage = Math.max(1, Math.min(60, Number(url.searchParams.get('perPage') || 30)))
      const payload = {
        CustomerId: FLOMIZ_CUSTOMER_ID,
        PortalType: FLOMIZ_PORTAL_TYPE,
        ProductStockType: 3,
        IsRemoveZeroStock: true,
        IsShowRapaportPrice: false,
        PhotoSize: 1,
        PageContext: { Page: page, PerPage: perPage },
      }
      const auth = FLOMIZ_API_USERNAME && FLOMIZ_API_PASSWORD
        ? { Authorization: 'Basic ' + Buffer.from(`${FLOMIZ_API_USERNAME}:${FLOMIZ_API_PASSWORD}`).toString('base64') }
        : {}
      const upstream = await fetch(FLOMIZ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...auth },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      })
      if (!upstream.ok) return json(res, 502, { error: 'Inventory provider returned an error.' })
      const data = await upstream.json()
      if (Number(data.Code) !== 1 || !Array.isArray(data.lstProduct)) {
        return json(res, 502, { error: 'Inventory response could not be validated.' })
      }
      return json(res, 200, {
        items: data.lstProduct.map(publicProduct).filter(item => item.sku),
        page: data.PageContext?.Page ?? page,
        perPage: data.PageContext?.PerPage ?? perPage,
        totalPages: data.PageContext?.TotalPage ?? null,
        totalRecords: data.PageContext?.TotalRecord ?? null,
      })
    }

    if (req.method === 'POST' && url.pathname === '/api/inquiries') {
      if (!supabaseReady()) return json(res, 503, { error: 'Inquiry service is not configured yet.' })
      const input = await bodyJson(req)
      const name = String(input.name || '').trim()
      const email = String(input.email || '').trim().toLowerCase()
      const message = String(input.message || '').trim()
      if (name.length < 1 || name.length > 120 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length > 254 || message.length < 1 || message.length > 3000) {
        return json(res, 400, { error: 'Please check your name, email and message.' })
      }
      const rows = await db('orders', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          customer_name: name, customer_email: email, status: 'inquiry',
          customer_message: message, currency: 'USD', subtotal: 0, discount_total: 0, tax_total: 0, total: 0,
        }),
      })
      return json(res, 201, { submitted: true, inquiryNumber: rows?.[0]?.order_number || null, message: 'Thank you. Our team will follow up.' })
    }

    if (req.method === 'POST' && url.pathname === '/api/quotes') {
      if (!supabaseReady()) return json(res, 503, { error: 'Quote service is not configured yet.' })
      const customer = await authenticatedUser(req)
      if (!customer?.id || !customer.email) return json(res, 401, { error: 'Please sign in to save a price quote.' })
      const input = await bodyJson(req)
      // Identity comes from the signed-in website account, never from Flomiz or client-supplied email.
      const email = String(customer.email).trim().toLowerCase()
      const name = String(customer.user_metadata?.full_name || customer.user_metadata?.name || input.name || '').trim()
      const message = String(input.message || '').trim()
      const items = Array.isArray(input.items) ? input.items : []
      if (name.length < 1 || name.length > 120 || email.length > 254 || message.length > 2000 || items.length < 1 || items.length > 30) {
        return json(res, 400, { error: 'Please check your account name and include 1–30 diamond items.' })
      }
      const normalizedItems = []
      for (const item of items) {
        const sku = String(item.sku || '').trim()
        const productName = String(item.name || '').trim()
        const quantity = Number(item.quantity ?? 1)
        const requestedPrice = Number(item.requestedPrice)
        const currentPrice = null // Never trust a browser-supplied price as the authoritative displayed price.
        if (!sku || sku.length > 100 || !productName || productName.length > 250 || !Number.isInteger(quantity) || quantity < 1 || quantity > 100 || !Number.isFinite(requestedPrice) || requestedPrice <= 0 || requestedPrice > 100000000 || (currentPrice !== null && (!Number.isFinite(currentPrice) || currentPrice < 0 || currentPrice > 100000000))) {
          return json(res, 400, { error: 'Check each diamond SKU, quantity and requested price.' })
        }
        normalizedItems.push({
          flomiz_sku: sku,
          product_name: productName,
          product_snapshot: { clientProvided: true }, // Untrusted reference only; re-fetch and verify inventory before any sale.
          quantity,
          current_unit_price: currentPrice,
          requested_unit_price: requestedPrice,
        })
      }
      const quoteRows = await db('quote_requests', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: customer.id,
          customer_name: name,
          customer_email: email,
          customer_message: message || null,
          status: 'new',
        }),
      })
      const quote = quoteRows?.[0]
      if (!quote?.id) throw new Error('Quote request could not be created')
      await db('quote_request_items', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(normalizedItems.map(item => ({ ...item, quote_request_id: quote.id }))),
      })
      await db('audit_log', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ action: 'customer_quote_submitted', entity_type: 'quote_request', entity_id: quote.id, metadata: { item_count: normalizedItems.length } }),
      })
      return json(res, 201, {
        submitted: true,
        quoteNumber: quote.quote_number,
        quoteId: quote.id,
        message: 'Your quote request has been saved and is now available to the admin team.',
      })
    }

    if (req.method === 'POST' && url.pathname === '/api/reviews') {
      if (!supabaseReady()) return json(res, 503, { error: 'Review submission is not configured yet.' })
      const now = Date.now()
      const key = req.socket.remoteAddress || 'unknown'
      const previous = reviewRate.get(key) || 0
      if (now - previous < 30000) return json(res, 429, { error: 'Please wait before submitting another review.' })
      const input = await bodyJson(req)
      const name = String(input.name || '').trim()
      const email = String(input.email || '').trim().toLowerCase()
      const remarks = String(input.remarks || '').trim()
      const rating = Number(input.rating)
      if (name.length < 1 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || remarks.length < 1 || remarks.length > 2000 || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        return json(res, 400, { error: 'Please check the name, email, feedback and star rating.' })
      }
      reviewRate.set(key, now)
      const rows = await db('reviews', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ customer_name: name, customer_email: email, remarks, rating, status: 'published' }),
      })
      return json(res, 201, { submitted: true, message: 'Thank you for sharing your feedback.' })
    }

    if (url.pathname.startsWith('/api/admin/')) {
      const admin = await requireAdmin(req)
      if (!admin) return json(res, 401, { error: 'Sign in with an authorized administrator account.' })
      const p = admin.permissions

      if (req.method === 'GET' && url.pathname === '/api/admin/quotes') {
        if (!p.can_manage_orders) return json(res, 403, { error: 'Order-management permission required.' })
        const rows = await db('quote_requests?select=id,quote_number,customer_name,customer_email,customer_message,status,created_at,quote_request_items(id,flomiz_sku,product_name,product_snapshot,quantity,current_unit_price,requested_unit_price)&order=created_at.desc')
        return json(res, 200, { items: rows, unreadCount: (rows || []).filter(row => row.status === 'new').length })
      }
      if (req.method === 'PATCH' && /^\/api\/admin\/quotes\/[0-9a-f-]+$/i.test(url.pathname)) {
        if (!p.can_manage_orders) return json(res, 403, { error: 'Order-management permission required.' })
        const input = await bodyJson(req)
        const allowed = ['new', 'under_review', 'counter_offered', 'accepted', 'declined', 'converted_to_order', 'closed']
        if (!allowed.includes(input.status)) return json(res, 400, { error: 'Invalid quote request status.' })
        const id = url.pathname.split('/').pop()
        const rows = await db(`quote_requests?id=eq.${id}&select=id,quote_number,status`)
        if (!rows?.[0]) return json(res, 404, { error: 'Quote request not found.' })
        await db(`quote_requests?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: input.status, updated_at: new Date().toISOString() }) })
        await db('audit_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ actor_user_id: admin.user.id, action: 'quote_request_status_changed', entity_type: 'quote_request', entity_id: id, metadata: { status: input.status } }) })
        return json(res, 200, { updated: true, status: input.status })
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/reviews') {
        if (!p.can_manage_orders) return json(res, 403, { error: 'Review-management permission required.' })
        const rows = await db('reviews?select=id,customer_name,rating,remarks,status,submitted_at&order=submitted_at.desc')
        return json(res, 200, { items: rows })
      }
      if (req.method === 'PATCH' && /^\/api\/admin\/reviews\/[0-9a-f-]+$/.test(url.pathname)) {
        const input = await bodyJson(req)
        if (!['published', 'hidden'].includes(input.status)) return json(res, 400, { error: 'Status must be published or hidden.' })
        const id = url.pathname.split('/').pop()
        await db(`reviews?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: input.status, updated_at: new Date().toISOString() }) })
        await db('audit_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ actor_user_id: admin.user.id, action: 'review_status_changed', entity_type: 'review', entity_id: id, metadata: { status: input.status } }) })
        return json(res, 200, { updated: true })
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/dealer-applications') {
        if (!p.can_review_kyc) return json(res, 403, { error: 'KYC review permission required.' })
        const rows = await db('dealer_applications?select=id,user_id,status,registered_business_name,primary_contact,primary_email,submitted_at&order=submitted_at.desc')
        return json(res, 200, { items: rows })
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/orders') {
        if (!p.can_manage_orders) return json(res, 403, { error: 'Order-management permission required.' })
        const rows = await db('orders?select=id,order_number,customer_name,customer_email,status,total,currency,created_at&order=created_at.desc')
        return json(res, 200, { items: rows })
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/promotions') {
        if (!p.can_manage_promotions) return json(res, 403, { error: 'Promotion-management permission required.' })
        const rows = await db('promotions?select=*&order=created_at.desc')
        return json(res, 200, { items: rows })
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/review-replies') {
        if (!p.can_manage_orders) return json(res, 403, { error: 'Review-management permission required.' })
        const input = await bodyJson(req)
        const reviewId = String(input.reviewId || '')
        const replyText = String(input.replyText || '').trim()
        if (!/^[0-9a-f-]{36}$/i.test(reviewId) || replyText.length < 1 || replyText.length > 3000) {
          return json(res, 400, { error: 'Provide a valid review ID and a reply under 3,000 characters.' })
        }
        const reviewRows = await db(`reviews?id=eq.${reviewId}&select=id,customer_name,customer_email,user_id,status`)
        const review = reviewRows?.[0]
        if (!review) return json(res, 404, { error: 'Review not found.' })
        const replyRows = await db('review_replies', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ review_id: reviewId, admin_user_id: admin.user.id, reply_text: replyText }),
        })
        await db('audit_log', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ actor_user_id: admin.user.id, action: 'review_replied', entity_type: 'review', entity_id: reviewId }),
        })
        // In-app and email notification delivery are queued separately once a verified
        // account/email relationship and an email provider are configured.
        return json(res, 201, { reply: replyRows?.[0] || { review_id: reviewId }, notificationQueued: false })
      }

      if (req.method === 'PATCH' && /^\/api\/admin\/dealer-applications\/[0-9a-f-]+$/i.test(url.pathname)) {
        if (!p.can_review_kyc) return json(res, 403, { error: 'KYC review permission required.' })
        const input = await bodyJson(req)
        const allowed = ['pending_review', 'more_information_required', 'approved', 'rejected', 'suspended']
        if (!allowed.includes(input.status)) return json(res, 400, { error: 'Invalid dealer application status.' })
        const id = url.pathname.split('/').pop()
        const rows = await db(`dealer_applications?id=eq.${id}&select=id,user_id,status`)
        if (!rows?.[0]) return json(res, 404, { error: 'Dealer application not found.' })
        await db(`dealer_applications?id=eq.${id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: input.status, reviewer_user_id: admin.user.id, reviewer_notes: String(input.notes || '').slice(0, 2000), reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
        })
        await db(`profiles?id=eq.${rows[0].user_id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ dealer_status: input.status, updated_at: new Date().toISOString() }),
        })
        await db('audit_log', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ actor_user_id: admin.user.id, action: 'dealer_application_status_changed', entity_type: 'dealer_application', entity_id: id, metadata: { status: input.status } }),
        })
        return json(res, 200, { updated: true, status: input.status, emailNotificationQueued: false })
      }

      if (req.method === 'POST' && url.pathname === '/api/admin/promotions') {
        if (!p.can_manage_promotions) return json(res, 403, { error: 'Promotion-management permission required.' })
        const input = await bodyJson(req)
        const name = String(input.name || '').trim()
        const kind = String(input.discountKind || '')
        const value = Number(input.discountValue)
        if (!name || name.length > 120 || !['percentage', 'fixed_amount'].includes(kind) || !Number.isFinite(value) || value <= 0 || (kind === 'percentage' && value > 100)) {
          return json(res, 400, { error: 'Check the promotion name and discount value.' })
        }
        const rows = await db('promotions', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            name, public_code: input.publicCode ? String(input.publicCode).trim().toUpperCase().slice(0, 50) : null,
            description: String(input.description || '').slice(0, 1000),
            discount_kind: kind, discount_value: value,
            eligibility: input.eligibility && typeof input.eligibility === 'object' ? input.eligibility : {},
            starts_at: input.startsAt || null, ends_at: input.endsAt || null,
            max_redemptions: input.maxRedemptions ? Number(input.maxRedemptions) : null,
            combinable: input.combinable === true, banner_enabled: input.bannerEnabled === true,
            banner_text: String(input.bannerText || '').slice(0, 250),
            active: input.active === true, created_by: admin.user.id,
          }),
        })
        await db('audit_log', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ actor_user_id: admin.user.id, action: 'promotion_created', entity_type: 'promotion', entity_id: rows?.[0]?.id || null }),
        })
        return json(res, 201, { promotion: rows?.[0] || null })
      }

      return json(res, 404, { error: 'Admin endpoint not found.' })
    }
    return json(res, 404, { error: 'Not found.' })
  } catch (error) {
    console.error('API request failed:', error instanceof Error ? error.message : 'unknown error')
    return json(res, 500, { error: 'The request could not be completed.' })
  }
})
server.listen(PORT, () => console.log(`Hey Man Diamond API listening on port ${PORT}`))
