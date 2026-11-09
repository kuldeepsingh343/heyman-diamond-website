import { db, json, bodyJson, supabaseReady, getClientIp } from './shared.mjs'
import { authenticatedUser } from './auth.mjs'
import { getEffectiveDiamondPrice } from './inventory.mjs'

const inquiryRate = new Map()
const INQUIRY_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_INQUIRIES_PER_HOUR = 10

export async function handleCreateInquiry(req, res) {
  const ip = getClientIp(req)
  const now = Date.now()
  const history = (inquiryRate.get(ip) || []).filter(t => now - t < INQUIRY_WINDOW_MS)
  if (history.length >= MAX_INQUIRIES_PER_HOUR) {
    return json(res, 429, { error: 'Too many inquiries submitted from this connection. Please try again later.' })
  }
  history.push(now)
  inquiryRate.set(ip, history)

  const input = await bodyJson(req)
  if (!supabaseReady()) return json(res, 503, { error: 'Inquiry service is not configured yet.' })
  const name = String(input.name || '').trim()
  const email = String(input.email || '').trim().toLowerCase()
  const phone = String(input.phone || '').trim()
  const interest = String(input.interest || '').trim()
  const message = String(input.message || '').trim()

  if (name.length < 1 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || message.length < 1 || message.length > 3000) {
    return json(res, 400, { error: 'Please provide a valid name, email address, and message under 3,000 characters.' })
  }

  const customerMessage = [
    phone ? `Phone: ${phone}` : null,
    interest ? `Interest: ${interest}` : null,
    message,
  ].filter(Boolean).join('\n\n')

  const rows = await db('orders', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      customer_name: name,
      customer_email: email,
      customer_message: customerMessage,
      status: 'inquiry',
      currency: 'USD',
      subtotal: 0,
      total: 0,
    }),
  })
  return json(res, 201, { inquiryId: rows?.[0]?.id, message: 'Thank you. A sales manager will respond shortly.' })
}

export async function handleCreateQuote(req, res) {
  const customer = await authenticatedUser(req)
  if (!customer?.id || !customer.email) return json(res, 401, { error: 'Please sign in to save a price quote.' })
  if (!supabaseReady()) return json(res, 503, { error: 'Quote service is not configured yet.' })

  const input = await bodyJson(req)
  const name = String(customer.user_metadata?.full_name || customer.user_metadata?.name || input.name || '').trim()
  const email = String(customer.email).trim().toLowerCase()
  const phone = String(input.phone || '').trim()
  const message = String(input.message || '').trim()
  const items = Array.isArray(input.items) ? input.items : []

  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || message.length > 3000 || items.length === 0 || items.length > 25) {
    return json(res, 400, { error: 'Provide your name, a valid email, and between 1 and 25 items for the quote request.' })
  }

  const customerMessage = [
    phone ? `Phone: ${phone}` : null,
    message || null,
  ].filter(Boolean).join('\n\n') || null

  const quoteRows = await db('quote_requests', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: customer.id,
      customer_name: name,
      customer_email: email,
      customer_message: customerMessage,
      status: 'new',
    }),
  })
  const quote = quoteRows?.[0]
  if (!quote?.id) return json(res, 500, { error: 'Unable to record your quote request.' })

  // Check if user is an approved wholesale dealer to snapshot correct audience rate
  let isApprovedDealer = false
  if (customer?.id && supabaseReady()) {
    try {
      const profileRows = await db(`profiles?id=eq.${encodeURIComponent(customer.id)}&select=account_type,dealer_status`)
      if (Array.isArray(profileRows) && profileRows.length > 0) {
        isApprovedDealer = profileRows[0].account_type === 'dealer' && profileRows[0].dealer_status === 'approved'
      }
    } catch {
      // ignore
    }
  }

  const itemPayloads = []
  for (const item of items) {
    const sku = String(item.sku || '').slice(0, 80)
    const effectivePrice = await getEffectiveDiamondPrice(sku, isApprovedDealer)
    itemPayloads.push({
      quote_request_id: quote.id,
      flomiz_sku: sku,
      product_name: String(item.name || item.shape || 'Lab-Grown Diamond').slice(0, 160),
      product_snapshot: {
        submitted_snapshot: item,
        server_effective_unit_price: effectivePrice,
        audience: isApprovedDealer ? 'dealer' : 'customer',
        disclaimer: 'Authoritative stone specifications and server-verified pricing snapshot.',
      },
      quantity: Math.max(1, Math.min(100, Number(item.quantity) || 1)),
      current_unit_price: effectivePrice > 0 ? effectivePrice : (Number(item.price) || 0),
      requested_unit_price: item.requestedPrice && !isNaN(Number(item.requestedPrice)) && Number(item.requestedPrice) > 0
        ? Number(item.requestedPrice)
        : (effectivePrice > 0 ? effectivePrice : 1),
    })
  }

  await db('quote_request_items', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(itemPayloads),
  })

  return json(res, 201, { quoteId: quote.id, quoteNumber: quote.quote_number, message: 'Quote request submitted. Our team will review stock and confirm pricing.' })
}

export async function handleGetAdminQuotes(req, res, admin) {
  if (!admin?.permissions?.can_manage_orders) return json(res, 403, { error: 'Order-management permission required.' })
  const rows = await db('quote_requests?select=id,quote_number,customer_name,customer_email,customer_message,status,created_at,quote_request_items(id,flomiz_sku,product_name,product_snapshot,quantity,current_unit_price,requested_unit_price)&order=created_at.desc')
  return json(res, 200, { items: rows, unreadCount: (rows || []).filter(row => row.status === 'new').length })
}

export async function handleUpdateQuoteStatus(req, res, admin, id) {
  if (!admin?.permissions?.can_manage_orders) return json(res, 403, { error: 'Order-management permission required.' })
  const cleanId = String(id || '').trim()
  if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid quote request identifier.' })
  }
  const input = await bodyJson(req)
  const allowed = ['new', 'under_review', 'counter_offered', 'accepted', 'declined', 'converted_to_order', 'closed']
  if (!allowed.includes(input.status)) return json(res, 400, { error: 'Invalid quote request status.' })

  const safeId = encodeURIComponent(cleanId)
  const rows = await db(`quote_requests?id=eq.${safeId}&select=id,quote_number,status`)
  if (!rows?.[0]) return json(res, 404, { error: 'Quote request not found.' })

  await db(`quote_requests?id=eq.${safeId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: input.status, updated_at: new Date().toISOString() }) })
  await db('audit_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ actor_user_id: admin.user.id, action: 'quote_request_status_changed', entity_type: 'quote_request', entity_id: cleanId, metadata: { status: input.status } }) })

  return json(res, 200, { updated: true, status: input.status })
}

export async function handleGetUserOrders(req, res) {
  const customer = await authenticatedUser(req)
  if (!customer?.id) return json(res, 401, { error: 'Please sign in to view your orders and quotes.' })

  let quotes = []
  let orders = []

  if (supabaseReady()) {
    try {
      quotes = await db(`quote_requests?user_id=eq.${customer.id}&select=id,quote_number,customer_name,customer_email,customer_message,status,created_at,quote_request_items(id,flomiz_sku,product_name,quantity,current_unit_price)&order=created_at.desc`)
    } catch (err) {
      console.warn('Fetch user quotes failed:', err.message)
    }

    try {
      orders = await db(`orders?user_id=eq.${customer.id}&order=created_at.desc`)
    } catch (err) {
      console.warn('Fetch user orders failed:', err.message)
    }
  }

  return json(res, 200, {
    quotes: quotes || [],
    orders: orders || [],
    totalQuotes: quotes?.length || 0,
    totalOrders: orders?.length || 0,
  })
}

