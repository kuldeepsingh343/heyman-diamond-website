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

const headers = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
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

      if (req.method === 'GET' && url.pathname === '/api/admin/reviews') {
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
      return json(res, 404, { error: 'Admin endpoint not found.' })
    }
    return json(res, 404, { error: 'Not found.' })
  } catch (error) {
    console.error('API request failed:', error instanceof Error ? error.message : 'unknown error')
    return json(res, 500, { error: 'The request could not be completed.' })
  }
})
server.listen(PORT, () => console.log(`Hey Man Diamond API listening on port ${PORT}`))
