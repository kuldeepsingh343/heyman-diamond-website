import { db, json, bodyJson, supabaseReady, getClientIp } from './shared.mjs'
import { authenticatedUser } from './auth.mjs'
import { getEffectiveDiamondPrice } from './inventory.mjs'
import { sendEmailNotification } from './mailer.mjs'

const inquiryRate = new Map()
const INQUIRY_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_INQUIRIES_PER_HOUR = 10

// In-memory store for fallback & instant quote handling
let memoryQuotes = []
let memoryQuoteItems = []
let memoryInquiries = []

export function resetMemoryQuotes() {
  memoryQuotes = []
  memoryQuoteItems = []
}

export function resetMemoryInquiries() {
  memoryInquiries = []
}

function formatInquiryEmailBody(item) {
  return [
    '======================================================',
    'HEY MAN DIAMOND LLC — NEW DIAMOND INQUIRY',
    '======================================================',
    '',
    `Inquiry Number : #INQ-${item.inquiry_number || 'NEW'}`,
    `Date & Time    : ${new Date().toUTCString()}`,
    '',
    'CUSTOMER INFORMATION:',
    `Name  : ${item.customer_name}`,
    `Email : ${item.customer_email}`,
    `Phone : ${item.customer_phone || 'Not provided'}`,
    item.user_id ? `Account User ID: ${item.user_id}` : 'Guest / Direct',
    '',
    'DIAMOND SPECIFICATIONS:',
    `SKU         : ${item.diamond_sku}`,
    `Shape       : ${item.diamond_shape || 'N/A'}`,
    `Carat       : ${item.diamond_carat ? `${item.diamond_carat} ct` : 'N/A'}`,
    `Color       : ${item.diamond_color || 'N/A'}`,
    `Clarity     : ${item.diamond_clarity || 'N/A'}`,
    `Cut         : ${item.diamond_cut || 'N/A'}`,
    `Price Listed: ${item.diamond_price ? `$${Number(item.diamond_price).toLocaleString()}` : 'Upon Request'}`,
    item.diamond_details?.certificateNumber ? `Certificate : ${item.diamond_details.certificateNumber}` : null,
    item.diamond_details?.measurements ? `Measurements: ${item.diamond_details.measurements}` : null,
    '',
    'CUSTOMER REMARKS & REQUIREMENTS:',
    '------------------------------------------------------',
    item.remarks,
    '------------------------------------------------------',
    '',
    'You can view and reply to this inquiry directly in the Admin Portal under Diamond Inquiries.',
    'Hey Man Diamond LLC Portal: https://heymandiamond.com/#signin',
  ].filter(line => line !== null).join('\n')
}

function formatCustomerReplyEmailBody(inquiry, adminReply, repliedBy) {
  return [
    `Dear ${inquiry.customer_name},`,
    '',
    `Thank you for contacting Hey Man Diamond LLC regarding Diamond SKU ${inquiry.diamond_sku} (${inquiry.diamond_shape || ''} ${inquiry.diamond_carat ? `${inquiry.diamond_carat}ct` : ''}).`,
    '',
    '------------------------------------------------------',
    `RESPONSE FROM HEY MAN DIAMOND SPECIALIST (${repliedBy}):`,
    '------------------------------------------------------',
    adminReply,
    '',
    '------------------------------------------------------',
    'YOUR ORIGINAL INQUIRY:',
    '------------------------------------------------------',
    `Diamond SKU : ${inquiry.diamond_sku}`,
    `Your Remarks: ${inquiry.remarks}`,
    '',
    'If you have any further questions or would like to proceed, feel free to reply directly to this email or call our Chicago office at +1 312 646 0070.',
    '',
    'Warm regards,',
    'Hey Man Diamond LLC Team',
    'Mallers Building, 5 South Wabash Avenue, Suite 1704',
    'Chicago, IL 60603',
    'sales@heymandiamond.com | www.heymandiamond.com',
  ].join('\n')
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

  const isTestMemory = req.headers?.['x-test-memory'] === 'true' || process.env.TEST_ALLOW_MEMORY_INQUIRIES === 'true'
  if (!supabaseReady() && !isTestMemory) {
    return json(res, 503, { error: 'Inquiry service is not configured yet.' })
  }

  const customer = await authenticatedUser(req)
  const input = await bodyJson(req)

  const name = String(input.name || customer?.user_metadata?.full_name || customer?.email?.split('@')[0] || '').trim()
  const email = String(input.email || customer?.email || '').trim().toLowerCase()
  const phone = String(input.phone || customer?.phone || '').trim()
  const sku = String(input.sku || input.diamond_sku || input.flomiz_sku || '').trim().slice(0, 80)
  const shape = String(input.shape || input.diamond_shape || '').trim().slice(0, 50)
  const carat = Number(input.carat || input.diamond_carat || 0)
  const color = String(input.color || input.diamond_color || '').trim().slice(0, 50)
  const clarity = String(input.clarity || input.diamond_clarity || '').trim().slice(0, 50)
  const cut = String(input.cut || input.diamond_cut || '').trim().slice(0, 50)
  const price = Number(input.price || input.diamond_price || 0)
  const remarks = String(input.remarks || input.message || '').trim()
  const diamondDetails = input.diamond_details || input.diamond || {}

  if (!customer?.id && (!name || !email)) {
    return json(res, 401, { error: 'Please sign in to submit a diamond inquiry.' })
  }

  if (name.length < 1 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || remarks.length < 1 || remarks.length > 3000) {
    return json(res, 400, { error: 'Please provide a valid name, email address, and remarks under 3,000 characters.' })
  }

  const inquiryRecord = {
    user_id: customer?.id || null,
    diamond_sku: sku || 'GENERAL-INQUIRY',
    diamond_shape: shape || null,
    diamond_carat: carat > 0 ? carat : null,
    diamond_color: color || null,
    diamond_clarity: clarity || null,
    diamond_cut: cut || null,
    diamond_price: price > 0 ? price : null,
    diamond_details: diamondDetails,
    customer_name: name,
    customer_email: email,
    customer_phone: phone || null,
    remarks: remarks,
    status: 'new',
  }

  let inquiry = null
  const fallbackId = `inq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const fallbackNumber = Math.floor(1000 + Math.random() * 9000)

  if (supabaseReady()) {
    try {
      const rows = await db('diamond_inquiries', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(inquiryRecord),
      })
      if (rows?.[0]) {
        inquiry = {
          id: fallbackId,
          inquiry_number: fallbackNumber,
          ...inquiryRecord,
          ...rows[0],
        }
      }
    } catch (dbErr) {
      console.warn('DB inquiry save failed, fallback to memory store:', dbErr.message)
    }
  }

  if (!inquiry) {
    inquiry = {
      id: fallbackId,
      inquiry_number: fallbackNumber,
      ...inquiryRecord,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  memoryInquiries.unshift(inquiry)

  // Dispatch email notification to sales@heymandiamond.com
  sendEmailNotification({
    to: 'sales@heymandiamond.com',
    replyTo: email,
    subject: `New Diamond Inquiry: ${inquiry.diamond_shape ? `${inquiry.diamond_shape} ` : ''}${inquiry.diamond_carat ? `${inquiry.diamond_carat}ct ` : ''}(${inquiry.diamond_sku}) from ${name}`,
    text: formatInquiryEmailBody(inquiry),
  }).catch(err => console.warn('[Mailer:Inquiry Error]', err.message))

  return json(res, 201, {
    inquiryId: inquiry.id,
    inquiryNumber: inquiry.inquiry_number || fallbackNumber,
    message: 'Thank you. Your inquiry has been submitted to sales@heymandiamond.com. Our diamond specialist will respond shortly.'
  })
}

export async function handleGetAdminInquiries(req, res, admin) {
  if (!admin?.permissions?.can_manage_orders && !admin?.permissions?.can_manage_inventory && admin?.role !== 'super_admin' && admin?.role !== 'admin' && admin?.role !== 'sales_manager') {
    return json(res, 403, { error: 'Inquiry management permission required.' })
  }
  let rows = []
  if (supabaseReady()) {
    try {
      rows = await db('diamond_inquiries?select=*&order=created_at.desc')
    } catch (e) {
      console.warn('Fetch admin inquiries from DB failed, using memory fallback:', e.message)
    }
  }
  if (!rows || rows.length === 0) {
    rows = memoryInquiries
  }
  return json(res, 200, {
    items: rows || [],
    unreadCount: (rows || []).filter(i => i.status === 'new' || i.status === 'in_progress').length,
  })
}

export async function handleReplyAdminInquiry(req, res, admin, id) {
  if (!admin?.permissions?.can_manage_orders && !admin?.permissions?.can_manage_inventory && admin?.role !== 'super_admin' && admin?.role !== 'admin' && admin?.role !== 'sales_manager') {
    return json(res, 403, { error: 'Inquiry management permission required.' })
  }
  const cleanId = String(id || '').trim()
  if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid inquiry identifier.' })
  }
  const input = await bodyJson(req)
  const reply = String(input.reply || '').trim()
  if (reply.length < 1 || reply.length > 3000) {
    return json(res, 400, { error: 'Please enter a reply between 1 and 3,000 characters.' })
  }

  const safeId = encodeURIComponent(cleanId)
  let inquiry = null
  if (supabaseReady()) {
    try {
      const rows = await db(`diamond_inquiries?id=eq.${safeId}&select=*`)
      if (rows?.[0]) inquiry = rows[0]
    } catch {
      // ignore
    }
  }
  if (!inquiry) {
    inquiry = memoryInquiries.find(i => String(i.id) === cleanId || String(i.inquiry_number) === cleanId)
  }
  if (!inquiry) return json(res, 404, { error: 'Inquiry not found.' })

  const repliedBy = admin.user?.email || admin.user?.user_metadata?.full_name || 'Hey Man Diamond Specialist'
  const repliedAt = new Date().toISOString()
  const newStatus = input.status || 'replied'

  const updates = {
    admin_reply: reply,
    replied_at: repliedAt,
    replied_by: repliedBy,
    status: newStatus,
    updated_at: repliedAt,
  }

  if (supabaseReady()) {
    try {
      await db(`diamond_inquiries?id=eq.${safeId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(updates),
      })
      await db('audit_log', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          actor_user_id: admin.user?.id || 'admin',
          action: 'diamond_inquiry_replied',
          entity_type: 'diamond_inquiry',
          entity_id: cleanId,
          metadata: { diamond_sku: inquiry.diamond_sku, customer_email: inquiry.customer_email, status: newStatus }
        })
      })
    } catch (e) {
      console.warn('DB update inquiry reply failed:', e.message)
    }
  }

  // Update memory store
  const memInq = memoryInquiries.find(i => String(i.id) === cleanId || String(i.inquiry_number) === cleanId)
  if (memInq) {
    Object.assign(memInq, updates)
  }

  // Send reply notification email to customer
  sendEmailNotification({
    to: inquiry.customer_email,
    replyTo: 'sales@heymandiamond.com',
    subject: `Re: Your Inquiry for Diamond ${inquiry.diamond_sku} - Hey Man Diamond LLC`,
    text: formatCustomerReplyEmailBody(inquiry, reply, repliedBy),
  }).catch(err => console.warn('[Mailer:Reply Error]', err.message))

  return json(res, 200, {
    success: true,
    updated: true,
    item: { ...inquiry, ...updates },
    message: 'Reply saved and sent to customer.',
  })
}

export async function handleUpdateInquiryStatus(req, res, admin, id) {
  if (!admin?.permissions?.can_manage_orders && !admin?.permissions?.can_manage_inventory && admin?.role !== 'super_admin' && admin?.role !== 'admin' && admin?.role !== 'sales_manager') {
    return json(res, 403, { error: 'Inquiry management permission required.' })
  }
  const cleanId = String(id || '').trim()
  if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid inquiry identifier.' })
  }
  const input = await bodyJson(req)
  const allowed = ['new', 'in_progress', 'replied', 'closed']
  if (!allowed.includes(input.status)) return json(res, 400, { error: 'Invalid inquiry status.' })

  const safeId = encodeURIComponent(cleanId)
  const updates = { status: input.status, updated_at: new Date().toISOString() }

  if (supabaseReady()) {
    try {
      await db(`diamond_inquiries?id=eq.${safeId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(updates),
      })
    } catch (e) {
      console.warn('DB update inquiry status failed:', e.message)
    }
  }

  const memInq = memoryInquiries.find(i => String(i.id) === cleanId || String(i.inquiry_number) === cleanId)
  if (memInq) {
    Object.assign(memInq, updates)
  }

  return json(res, 200, { success: true, updated: true, status: input.status })
}

export async function handleGetUserInquiries(req, res) {
  const customer = await authenticatedUser(req)
  if (!customer?.id) return json(res, 401, { error: 'Please sign in to view your inquiries.' })

  let items = []
  if (supabaseReady()) {
    try {
      items = await db(`diamond_inquiries?user_id=eq.${customer.id}&select=*&order=created_at.desc`)
    } catch (err) {
      console.warn('Fetch user inquiries failed:', err.message)
    }
  }

  if (!items || items.length === 0) {
    items = memoryInquiries.filter(i => i.user_id === customer.id || i.customer_email === customer.email)
  }

  return json(res, 200, { items: items || [] })
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
  if (customer) {
    let accountType = customer.account_type || customer.user_metadata?.account_type || 'customer'
    let dealerStatus = customer.dealer_status || customer.user_metadata?.dealer_status || 'not_applied'

    if (customer.id && supabaseReady()) {
      try {
        const profileRows = await db(`profiles?id=eq.${encodeURIComponent(customer.id)}&select=account_type,dealer_status`)
        if (Array.isArray(profileRows) && profileRows.length > 0) {
          accountType = profileRows[0].account_type || accountType
          dealerStatus = profileRows[0].dealer_status || dealerStatus
        }
      } catch {
        // ignore
      }
    }

    isApprovedDealer = accountType === 'dealer' && dealerStatus === 'approved'
  }

  let hasCustomOffer = false
  const itemPayloads = []
  let totalEstimated = 0

  for (const item of items) {
    const sku = String(item.sku || item.flomiz_sku || '').slice(0, 80)
    const effectivePrice = await getEffectiveDiamondPrice(sku, isApprovedDealer)
    const fallbackCatalogPrice = Number(item.catalogPrice || item.price || item.listPrice || item.requestedPrice || 0)
    const unitPrice = effectivePrice > 0 ? effectivePrice : fallbackCatalogPrice
    const qty = Math.max(1, Math.min(100, Number(item.quantity) || 1))

    const requestedPriceNum = item.requestedPrice && !isNaN(Number(item.requestedPrice)) && Number(item.requestedPrice) > 0
      ? Number(item.requestedPrice)
      : (unitPrice > 0 ? unitPrice : 1)

    const isCustomOffer = (item.isCustomQuote || item.customQuotePrice != null) && Math.abs(requestedPriceNum - unitPrice) > 0.01
    if (isCustomOffer) hasCustomOffer = true

    totalEstimated += requestedPriceNum * qty

    itemPayloads.push({
      flomiz_sku: sku,
      product_name: String(item.name || item.shape || 'Lab-Grown Diamond').slice(0, 160),
      product_snapshot: {
        submitted_snapshot: item,
        sku: sku,
        shape: item.shape,
        carat: item.carat,
        color: item.color,
        clarity: item.clarity,
        cut: item.cut,
        lab: item.lab,
        certificateNumber: item.certificateNumber,
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

