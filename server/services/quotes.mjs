import { db, json, bodyJson, supabaseReady, getClientIp } from './shared.mjs'
import { authenticatedUser } from './auth.mjs'
import { getEffectiveDiamondPrice } from './inventory.mjs'

const inquiryRate = new Map()
const INQUIRY_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_INQUIRIES_PER_HOUR = 10

// In-memory store for fallback & instant quote handling
let memoryQuotes = []
let memoryQuoteItems = []

export function resetMemoryQuotes() {
  memoryQuotes = []
  memoryQuoteItems = []
}

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

  const input = await bodyJson(req)
  const name = String(customer.user_metadata?.full_name || customer.user_metadata?.name || input.name || '').trim()
  const email = String(customer.email).trim().toLowerCase()
  const phone = String(input.phone || '').trim()
  const shippingAddress = String(input.shippingAddress || '').trim()
  const deliveryPreference = String(input.deliveryPreference || 'Armored Courier (Insured)').trim()
  const message = String(input.message || '').trim()
  const items = Array.isArray(input.items) ? input.items : []

  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || message.length > 3000 || items.length === 0 || items.length > 25) {
    return json(res, 400, { error: 'Provide your name, a valid email, and between 1 and 25 items for the quote request.' })
  }

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

  let hasCustomOffer = false
  const itemPayloads = []
  let totalEstimated = 0

  for (const item of items) {
    const sku = String(item.sku || item.flomiz_sku || '').slice(0, 80)
    const effectivePrice = await getEffectiveDiamondPrice(sku, isApprovedDealer)
    const unitPrice = effectivePrice > 0 ? effectivePrice : (Number(item.price) || 0)
    const qty = Math.max(1, Math.min(100, Number(item.quantity) || 1))

    const requestedPriceNum = item.requestedPrice && !isNaN(Number(item.requestedPrice)) && Number(item.requestedPrice) > 0
      ? Number(item.requestedPrice)
      : (effectivePrice > 0 ? effectivePrice : (Number(item.price) || 1))

    const isCustomOffer = (item.isCustomQuote || item.customQuotePrice != null) && Math.abs(requestedPriceNum - unitPrice) > 0.01
    if (isCustomOffer) hasCustomOffer = true

    totalEstimated += requestedPriceNum * qty

    itemPayloads.push({
      flomiz_sku: sku,
      product_name: String(item.name || item.shape || 'Lab-Grown Diamond').slice(0, 160),
      product_snapshot: {
        submitted_snapshot: item,
        server_effective_unit_price: effectivePrice,
        catalog_unit_price: unitPrice,
        customer_requested_price: requestedPriceNum,
        is_custom_offer: isCustomOffer,
        audience: isApprovedDealer ? 'dealer' : 'customer',
        disclaimer: 'Authoritative stone specifications and server-verified pricing snapshot.',
      },
      quantity: qty,
      current_unit_price: unitPrice,
      requested_unit_price: requestedPriceNum,
    })
  }

  const customNotice = hasCustomOffer
    ? `[Customer Custom Price Offer]: Customer submitted target offer totaling $${totalEstimated.toLocaleString()}. Pending Sales Manager review.`
    : null

  const customerMessage = [
    phone ? `Phone: ${phone}` : null,
    shippingAddress ? `Delivery Address: ${shippingAddress}` : null,
    deliveryPreference ? `Fulfillment Method: ${deliveryPreference}` : null,
    message ? `Customer Notes: ${message}` : null,
    customNotice,
  ].filter(Boolean).join('\n\n') || null

  const initialStatus = hasCustomOffer ? 'under_review' : 'new'

  let quote = null
  const fallbackQuoteId = `quote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const fallbackQuoteNum = Math.floor(10000 + Math.random() * 90000)

  if (supabaseReady()) {
    try {
      const quoteRows = await db('quote_requests', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: customer.id,
          customer_name: name,
          customer_email: email,
          customer_message: customerMessage,
          status: initialStatus,
        }),
      })
      quote = quoteRows?.[0]
      if (quote?.id) {
        const dbItems = itemPayloads.map(it => ({
          quote_request_id: quote.id,
          ...it,
        }))
        await db('quote_request_items', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(dbItems),
        })
      }
    } catch (dbErr) {
      console.warn('DB quote save error, fallback to memory store:', dbErr.message)
    }
  }

  if (!quote) {
    quote = {
      id: fallbackQuoteId,
      quote_number: fallbackQuoteNum,
      user_id: customer.id,
      customer_name: name,
      customer_email: email,
      customer_message: customerMessage,
      status: initialStatus,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  // Always keep in memory store for local dev & instant recall
  memoryQuotes.unshift({
    ...quote,
    quote_number: quote.quote_number || fallbackQuoteNum,
  })
  for (const it of itemPayloads) {
    memoryQuoteItems.push({
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      quote_request_id: quote.id,
      ...it,
    })
  }

  return json(res, 201, {
    quoteId: quote.id,
    quoteNumber: quote.quote_number || fallbackQuoteNum,
    estimatedTotal: totalEstimated,
    itemsCount: itemPayloads.length,
    hasCustomOffer,
    status: initialStatus,
    message: hasCustomOffer
      ? 'Custom price quote submitted. Our sales manager will review and confirm your offer.'
      : 'Quote request submitted. Our sales team will review stock and confirm pricing.',
  })
}

export async function handleGetAdminQuotes(req, res, admin) {
  if (!admin?.permissions?.can_manage_orders) return json(res, 403, { error: 'Order-management permission required.' })
  let rows = []
  if (supabaseReady()) {
    try {
      rows = await db('quote_requests?select=id,quote_number,customer_name,customer_email,customer_message,status,created_at,quote_request_items(id,flomiz_sku,product_name,product_snapshot,quantity,current_unit_price,requested_unit_price)&order=created_at.desc')
    } catch (e) {
      console.warn('Fetch admin quotes from DB failed, using memory fallback:', e.message)
    }
  }
  if (!rows || rows.length === 0) {
    rows = memoryQuotes.map(q => ({
      ...q,
      quote_request_items: memoryQuoteItems.filter(i => i.quote_request_id === q.id),
    }))
  }
  return json(res, 200, {
    items: rows || [],
    unreadCount: (rows || []).filter(row => row.status === 'new' || row.status === 'under_review').length,
  })
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
  let quote = null
  if (supabaseReady()) {
    try {
      const rows = await db(`quote_requests?id=eq.${safeId}&select=id,quote_number,status,customer_message`)
      if (rows?.[0]) quote = rows[0]
    } catch {
      // ignore
    }
  }
  if (!quote) {
    quote = memoryQuotes.find(q => q.id === cleanId)
  }
  if (!quote) return json(res, 404, { error: 'Quote request not found.' })

  const updates = {
    status: input.status,
    updated_at: new Date().toISOString(),
  }
  if (input.adminNote) {
    const existingMsg = quote.customer_message || ''
    const noteText = `[Sales Manager Note · ${new Date().toLocaleDateString()}]: ${String(input.adminNote).trim()}`
    updates.customer_message = existingMsg ? `${existingMsg}\n\n${noteText}` : noteText
  }

  if (supabaseReady()) {
    try {
      await db(`quote_requests?id=eq.${safeId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(updates) })
      await db('audit_log', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          actor_user_id: admin.user?.id || 'admin',
          action: 'quote_request_status_changed',
          entity_type: 'quote_request',
          entity_id: cleanId,
          metadata: { status: input.status, adminNote: input.adminNote || null, counterPrice: input.counterPrice || null }
        })
      })
    } catch (e) {
      console.warn('DB update quote failed:', e.message)
    }
  }

  // Update in memory store
  const memQuote = memoryQuotes.find(q => q.id === cleanId)
  if (memQuote) {
    memQuote.status = input.status
    if (updates.customer_message) memQuote.customer_message = updates.customer_message
    memQuote.updated_at = updates.updated_at
  }

  return json(res, 200, {
    success: true,
    updated: true,
    status: input.status,
    adminNote: input.adminNote || null,
    message: input.status === 'accepted'
      ? 'Quote price has been officially approved.'
      : (input.status === 'counter_offered' ? 'Counter-offer price submitted.' : `Quote status updated to ${input.status}.`)
  })
}

export async function handleGetUserOrders(req, res) {
  const customer = await authenticatedUser(req)
  if (!customer?.id) return json(res, 401, { error: 'Please sign in to view your orders and quotes.' })

  let quotes = []
  let orders = []

  if (supabaseReady()) {
    try {
      quotes = await db(`quote_requests?user_id=eq.${customer.id}&select=id,quote_number,customer_name,customer_email,customer_message,status,created_at,quote_request_items(id,flomiz_sku,product_name,quantity,current_unit_price,requested_unit_price,product_snapshot)&order=created_at.desc`)
    } catch (err) {
      console.warn('Fetch user quotes failed:', err.message)
    }

    try {
      orders = await db(`orders?user_id=eq.${customer.id}&order=created_at.desc`)
    } catch (err) {
      console.warn('Fetch user orders failed:', err.message)
    }
  }

  if (!quotes || quotes.length === 0) {
    quotes = memoryQuotes
      .filter(q => q.user_id === customer.id || q.customer_email === customer.email)
      .map(q => ({
        ...q,
        quote_request_items: memoryQuoteItems.filter(i => i.quote_request_id === q.id),
      }))
  }

  return json(res, 200, {
    quotes: quotes || [],
    orders: orders || [],
    totalQuotes: quotes?.length || 0,
    totalOrders: orders?.length || 0,
  })
}

