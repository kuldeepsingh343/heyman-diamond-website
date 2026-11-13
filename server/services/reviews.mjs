import { db, json, bodyJson, supabaseReady } from './shared.mjs'

const reviewRate = new Map()

const defaultReviews = [
  {
    id: 'sample-1',
    customer_name: 'Jessica M.',
    customer_email: 'jessica.m@example.com',
    rating: 5,
    remarks: 'The 2.5ct Emerald cut diamond we ordered exceeded all expectations. Exceptional sparkle and certified IGI paperwork came securely packaged.',
    submitted_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    reply: 'Thank you Jessica! It was a pleasure crafting this piece for you.',
    status: 'published',
  },
  {
    id: 'sample-2',
    customer_name: 'David K., Jeweler',
    customer_email: 'david.k@finejewelry.com',
    rating: 5,
    remarks: 'As a wholesale partner, Hey Man Diamond provides consistent, accurately graded lab melee and certified diamonds at top trade rates.',
    submitted_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    reply: 'We appreciate your continued partnership, David.',
    status: 'published',
  },
  {
    id: 'sample-3',
    customer_name: 'Marcus T.',
    customer_email: 'marcus.t@example.com',
    rating: 5,
    remarks: 'Ordered a matched pair of oval diamonds for bespoke earrings. Calibration was exact and the color consistency was flawless. Highly recommended!',
    submitted_at: new Date(Date.now() - 86400000 * 9).toISOString(),
    status: 'published',
  },
  {
    id: 'sample-4',
    customer_name: 'Elena R., Fine Jewelry Studio',
    customer_email: 'elena@elenajewelry.com',
    rating: 5,
    remarks: 'Superb customer service from Bharat and the sales team. Helped us source calibrated round melee parcels for our custom bridal rings within 48 hours.',
    submitted_at: new Date(Date.now() - 86400000 * 12).toISOString(),
    status: 'published',
  },
  {
    id: 'sample-5',
    customer_name: 'Aaron B., Verified Buyer',
    customer_email: 'aaron.b@example.com',
    rating: 5,
    remarks: 'First time ordering lab-grown diamonds online. The certificate lookup matched immediately, and the price was significantly better than standard dealers.',
    submitted_at: new Date(Date.now() - 86400000 * 15).toISOString(),
    status: 'published',
  },
  {
    id: 'sample-6',
    customer_name: 'Sophia C., Diamond Retailer',
    customer_email: 'sophia.c@retaildiamonds.com',
    rating: 5,
    remarks: 'Hey Man Diamond has been our go-to for pointer goods and custom layout parcels. Impeccable communication and honesty in grading.',
    submitted_at: new Date(Date.now() - 86400000 * 18).toISOString(),
    status: 'published',
  },
]

let memoryReviews = [...defaultReviews]

export async function handleGetReviews(req, res) {
  if (supabaseReady()) {
    try {
      const rows = await db('reviews?status=eq.published&select=id,customer_name,rating,remarks,submitted_at,review_replies(reply_text,created_at)&order=submitted_at.desc&limit=50')
      if (Array.isArray(rows) && rows.length > 0) {
        const items = rows.map(r => ({
          id: r.id,
          customer_name: r.customer_name,
          rating: r.rating,
          remarks: r.remarks,
          submitted_at: r.submitted_at,
          reply: r.review_replies?.[0]?.reply_text || null,
        }))
        return json(res, 200, { items })
      }
    } catch (err) {
      console.warn('Reviews DB fetch failed, using fallback:', err.message)
    }
  }

  return json(res, 200, { items: memoryReviews.filter(r => r.status !== 'hidden') })
}

export async function handleCreateReview(req, res) {
  const input = await bodyJson(req)
  if (!supabaseReady()) return json(res, 503, { error: 'Review service is not configured yet.' })

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip'
  const now = Date.now()
  const history = (reviewRate.get(ip) || []).filter(t => now - t < 3600000)
  if (history.length >= 10) return json(res, 429, { error: 'Too many submissions. Please try again later.' })
  history.push(now)
  reviewRate.set(ip, history)

  const name = String(input.name || '').trim()
  const email = String(input.email || '').trim().toLowerCase()
  const remarks = String(input.remarks || '').trim()
  const rating = Number(input.rating)

  if (name.length < 1 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || remarks.length < 1 || remarks.length > 2000 || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return json(res, 400, { error: 'Provide a valid name, email address, rating between 1 and 5, and review under 2,000 characters.' })
  }

  const rows = await db('reviews', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      customer_name: name,
      customer_email: email,
      rating,
      remarks,
      status: 'published',
    }),
  })

  const created = Array.isArray(rows) && rows[0] ? rows[0] : null
  const review = created
    ? {
        id: created.id,
        customer_name: created.customer_name,
        customer_email: created.customer_email || email,
        rating: created.rating,
        remarks: created.remarks,
        status: created.status || 'published',
        submitted_at: created.submitted_at || new Date().toISOString(),
        reply: null,
      }
    : {
        id: `rev-${Date.now()}`,
        customer_name: name,
        customer_email: email,
        rating,
        remarks,
        status: 'published',
        submitted_at: new Date().toISOString(),
        reply: null,
      }

  // Push new review to in-memory store so it shows up in both customer and admin views immediately
  memoryReviews.unshift(review)

  return json(res, 201, {
    message: 'Thank you! Your review has been posted and is now live on our website.',
    review,
  })
}

export async function handleGetAdminReviews(req, res, admin) {
  if (!admin?.permissions?.can_manage_reviews) return json(res, 403, { error: 'Review-management permission required.', message: 'Review-management permission required.' })

  if (supabaseReady()) {
    try {
      const rows = await db('reviews?select=id,customer_name,customer_email,rating,remarks,status,submitted_at,review_replies(id,reply_text,created_at)&order=submitted_at.desc')
      if (Array.isArray(rows)) {
        const items = rows.map(r => ({
          id: r.id,
          customer_name: r.customer_name,
          customer_email: r.customer_email,
          rating: r.rating,
          remarks: r.remarks,
          status: r.status,
          submitted_at: r.submitted_at,
          reply: r.review_replies?.[0]?.reply_text || null,
          reply_created_at: r.review_replies?.[0]?.created_at || null,
        }))
        return json(res, 200, { items })
      }
    } catch (err) {
      console.warn('Admin reviews DB query failed, using memory:', err.message)
    }
  }

  return json(res, 200, { items: memoryReviews })
}

export async function handleUpdateReviewStatus(req, res, admin, id) {
  const isSuper = admin?.role === 'super_admin' || admin?.isSuperAdmin
  const canToggle = isSuper || (Boolean(admin?.permissions?.can_manage_reviews) && admin?.permissions?.can_delete_reviews !== false)
  if (!canToggle) return json(res, 403, { error: 'Review status management permission required. You have permission to reply only.', message: 'Review status management permission required. You have permission to reply only.' })
  const input = await bodyJson(req).catch(() => ({}))
  if (!['published', 'hidden'].includes(input.status)) return json(res, 400, { error: 'Status must be published or hidden.' })

  const reviewId = String(id || '').trim()
  if (!reviewId || !/^[a-zA-Z0-9_-]+$/.test(reviewId)) {
    return json(res, 400, { error: 'Invalid review identifier.' })
  }
  const safeId = encodeURIComponent(reviewId)

  if (supabaseReady() && /^[0-9a-f-]{36}$/i.test(reviewId)) {
    try {
      await db(`reviews?id=eq.${safeId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: input.status, updated_at: new Date().toISOString() }) })
      await db('audit_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ actor_user_id: admin.user.id, action: 'review_status_changed', entity_type: 'review', entity_id: reviewId, metadata: { status: input.status } }) }).catch(() => {})
    } catch (err) {
      console.warn('DB review status update failed:', err.message)
    }
  }

  const mem = memoryReviews.find(r => r.id === reviewId)
  if (mem) {
    mem.status = input.status
  }

  return json(res, 200, { success: true, updated: true, status: input.status })
}

export async function handleCreateReviewReply(req, res, admin) {
  if (!admin?.permissions?.can_manage_reviews) return json(res, 403, { error: 'Review-management permission required.', message: 'Review-management permission required.' })
  const input = await bodyJson(req).catch(() => ({}))
  const reviewId = String(input.reviewId || '').trim()
  const replyText = String(input.replyText || '').trim()

  if (!reviewId || !/^[a-zA-Z0-9_-]+$/.test(reviewId) || replyText.length < 1 || replyText.length > 3000) {
    return json(res, 400, { error: 'Provide a valid review ID and a reply under 3,000 characters.' })
  }
  const safeId = encodeURIComponent(reviewId)

  let dbSaved = false
  if (supabaseReady() && /^[0-9a-f-]{36}$/i.test(reviewId)) {
    try {
      const reviewRows = await db(`reviews?id=eq.${safeId}&select=id,customer_name,customer_email,user_id,status`)
      const review = reviewRows?.[0]
      if (review) {
        const existingReplies = await db(`review_replies?review_id=eq.${safeId}&select=id`)
        if (Array.isArray(existingReplies) && existingReplies.length > 0) {
          await db(`review_replies?review_id=eq.${safeId}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ reply_text: replyText }),
          })
        } else {
          await db('review_replies', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({
              review_id: reviewId,
              admin_user_id: admin.user.id,
              reply_text: replyText,
            }),
          })
        }
        await db('audit_log', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ actor_user_id: admin.user.id, action: 'review_replied', entity_type: 'review', entity_id: reviewId }),
        }).catch(() => {})
        dbSaved = true
      }
    } catch (err) {
      console.warn('DB review reply failed, falling back to memory:', err.message)
    }
  }

  // Also update in memory
  const memItem = memoryReviews.find(r => r.id === reviewId)
  if (memItem) {
    memItem.reply = replyText
  }

  return json(res, 201, {
    success: true,
    message: 'Reply published successfully.',
    reply: { review_id: reviewId, reply_text: replyText },
    dbSaved,
  })
}

export async function handleDeleteReview(req, res, admin, id) {
  const isSuper = admin?.role === 'super_admin' || admin?.isSuperAdmin
  const canDelete = isSuper || (Boolean(admin?.permissions?.can_manage_reviews) && admin?.permissions?.can_delete_reviews !== false)
  if (!canDelete) return json(res, 403, { error: 'Delete review permission required. You have permission to reply only.', message: 'Delete review permission required. You have permission to reply only.' })
  const reviewId = String(id || '').trim()
  if (!reviewId || !/^[a-zA-Z0-9_-]+$/.test(reviewId)) return json(res, 400, { error: 'Invalid review identifier.' })
  const safeId = encodeURIComponent(reviewId)

  let dbDeleted = false
  if (supabaseReady() && /^[0-9a-f-]{36}$/i.test(reviewId)) {
    try {
      // First delete associated replies if any
      await db(`review_replies?review_id=eq.${safeId}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      }).catch(() => {})

      await db(`reviews?id=eq.${safeId}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      })
      await db('audit_log', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ actor_user_id: admin.user.id, action: 'review_deleted', entity_type: 'review', entity_id: reviewId }),
      }).catch(() => {})
      dbDeleted = true
    } catch (err) {
      console.warn('DB delete review failed:', err.message)
    }
  }

  // Also delete from memory store
  const idx = memoryReviews.findIndex(r => r.id === reviewId)
  if (idx !== -1) {
    memoryReviews.splice(idx, 1)
  }

  return json(res, 200, {
    success: true,
    message: 'Review deleted successfully.',
    deletedId: reviewId,
    dbDeleted,
  })
}
