import { db, json, bodyJson, supabaseReady } from './shared.mjs'

const reviewRate = new Map()

export async function handleGetReviews(req, res) {
  if (!supabaseReady()) {
    // Return sample verified reviews if Supabase is not connected
    return json(res, 200, {
      items: [
        {
          id: 'sample-1',
          customer_name: 'Jessica M.',
          rating: 5,
          remarks: 'The 2.5ct Emerald cut diamond we ordered exceeded all expectations. Exceptional sparkle and certified IGI paperwork came securely packaged.',
          submitted_at: new Date(Date.now() - 86400000 * 3).toISOString(),
          reply: 'Thank you Jessica! It was a pleasure crafting this piece for you.',
        },
        {
          id: 'sample-2',
          customer_name: 'David K., Jeweler',
          rating: 5,
          remarks: 'As a wholesale partner, Hey Man Diamond provides consistent, accurately graded lab melee and certified diamonds at top trade rates.',
          submitted_at: new Date(Date.now() - 86400000 * 7).toISOString(),
          reply: 'We appreciate your continued partnership, David.',
        },
      ],
    })
  }

  const rows = await db('reviews?status=eq.published&select=id,customer_name,rating,remarks,submitted_at,review_replies(reply_text,created_at)&order=submitted_at.desc&limit=50')
  const items = (rows || []).map(r => ({
    id: r.id,
    customer_name: r.customer_name,
    rating: r.rating,
    remarks: r.remarks,
    submitted_at: r.submitted_at,
    reply: r.review_replies?.[0]?.reply_text || null,
  }))
  return json(res, 200, { items })
}

export async function handleCreateReview(req, res) {
  const input = await bodyJson(req)
  if (!supabaseReady()) return json(res, 503, { error: 'Review service is not configured yet.' })

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip'
  const now = Date.now()
  const history = (reviewRate.get(ip) || []).filter(t => now - t < 3600000)
  if (history.length >= 3) return json(res, 429, { error: 'Too many submissions. Please try again later.' })
  history.push(now)
  reviewRate.set(ip, history)

  const name = String(input.name || '').trim()
  const email = String(input.email || '').trim().toLowerCase()
  const remarks = String(input.remarks || '').trim()
  const rating = Number(input.rating)

  if (name.length < 1 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || remarks.length < 1 || remarks.length > 2000 || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return json(res, 400, { error: 'Provide a valid name, email address, rating between 1 and 5, and review under 2,000 characters.' })
  }

  await db('reviews', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      customer_name: name,
      customer_email: email,
      rating,
      remarks,
      status: 'hidden',
    }),
  })
  return json(res, 201, { message: 'Thank you for your review. It will appear on our website after review by our team.' })
}

export async function handleGetAdminReviews(req, res, admin) {
  if (!admin?.permissions?.can_manage_reviews) return json(res, 403, { error: 'Review-management permission required.' })
  const rows = await db('reviews?select=id,customer_name,rating,remarks,status,submitted_at&order=submitted_at.desc')
  return json(res, 200, { items: rows })
}

export async function handleUpdateReviewStatus(req, res, admin, id) {
  if (!admin?.permissions?.can_manage_reviews) return json(res, 403, { error: 'Review-management permission required.' })
  const input = await bodyJson(req)
  if (!['published', 'hidden'].includes(input.status)) return json(res, 400, { error: 'Status must be published or hidden.' })

  await db(`reviews?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: input.status, updated_at: new Date().toISOString() }) })
  await db('audit_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ actor_user_id: admin.user.id, action: 'review_status_changed', entity_type: 'review', entity_id: id, metadata: { status: input.status } }) })

  return json(res, 200, { updated: true })
}

export async function handleCreateReviewReply(req, res, admin) {
  if (!admin?.permissions?.can_manage_reviews) return json(res, 403, { error: 'Review-management permission required.' })
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

  return json(res, 201, { reply: replyRows?.[0] || { review_id: reviewId }, notificationQueued: false })
}
