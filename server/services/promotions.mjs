import { db, json, bodyJson, supabaseReady } from './shared.mjs'

// Fallback in-memory promotions in case database is offline
let localPromotions = [
  {
    id: 'cd96e790-e2e0-47ae-a618-3a8d61810d13',
    name: 'Holiday Diamond Celebration',
    description: 'Exclusive wholesale incentive on certified lab-grown solitaires above 2.0 carats. Direct from our Surat & New York vaults.',
    media_type: 'image',
    media_url: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1800&q=85',
    cta_text: 'Explore Certified Stones',
    cta_link: '#collection',
    active: true,
  },
  {
    id: '7d809c35-96ae-43a1-9a52-857a418cac07',
    name: 'Trade Volume Privilege Scheme',
    description: 'Special pricing and expedited memo dispatch on calibrated Round Melee parcels & matched pairs for certified jewelers.',
    media_type: 'image',
    media_url: '/round-melee-diamonds.jpg',
    cta_text: 'Access Trade Pricing',
    cta_link: '#signup-dealer',
    active: true,
  },
]

export async function handleGetPromotions(req, res) {
  if (supabaseReady()) {
    try {
      const rows = await db('promotions?active=eq.true&order=created_at.desc')
      if (Array.isArray(rows) && rows.length > 0) {
        return json(res, 200, { promotions: rows })
      }
    } catch (err) {
      console.warn('Failed to fetch promotions from DB, using fallback:', err.message)
    }
  }
  return json(res, 200, { promotions: localPromotions.filter(p => p.active) })
}

export async function handleGetAdminPromotions(req, res, admin) {
  if (!admin) return json(res, 403, { error: 'Admin authorization required.' })
  if (supabaseReady()) {
    try {
      const rows = await db('promotions?order=created_at.desc')
      if (Array.isArray(rows)) {
        return json(res, 200, { promotions: rows })
      }
    } catch (err) {
      console.warn('Failed to fetch admin promotions from DB:', err.message)
    }
  }
  return json(res, 200, { promotions: localPromotions })
}

export function sanitizeLink(link) {
  if (!link) return '#collection'
  const str = String(link).trim()
  if (/^(javascript|data|vbscript):/i.test(str)) {
    return '#collection'
  }
  if (/^([#/]|https?:\/\/)/i.test(str)) {
    return str
  }
  return `#${str.replace(/[^a-zA-Z0-9_-]/g, '')}`
}

export async function handleCreatePromotion(req, res, admin) {
  if (!admin) return json(res, 403, { error: 'Admin authorization required.' })
  const input = await bodyJson(req)
  const name = String(input.name || '').trim()
  if (!name) return json(res, 400, { error: 'Offer title is required.' })

  const promoData = {
    name,
    description: String(input.description || '').trim(),
    media_type: input.media_type === 'video' ? 'video' : 'image',
    media_url: String(input.media_url || '').trim(),
    cta_text: String(input.cta_text || 'Explore Offer').trim(),
    cta_link: sanitizeLink(input.cta_link),
    discount_kind: input.discount_kind || 'percentage',
    discount_value: Number(input.discount_value) || 0,
    active: input.active !== false,
    banner_enabled: true,
    banner_text: name,
    updated_at: new Date().toISOString(),
  }

  if (supabaseReady()) {
    try {
      const inserted = await db('promotions', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(promoData),
      })
      if (inserted && inserted.length > 0) {
        return json(res, 201, { success: true, promotion: inserted[0] })
      }
    } catch (err) {
      console.error('Failed to insert promotion into DB:', err.message)
      return json(res, 500, { error: 'Failed to create promotion in database.' })
    }
  }

  const newPromo = { id: `local-${Date.now()}`, ...promoData, created_at: new Date().toISOString() }
  localPromotions.unshift(newPromo)
  return json(res, 201, { success: true, promotion: newPromo })
}

export async function handleUpdatePromotion(req, res, id, admin) {
  if (!admin) return json(res, 403, { error: 'Admin authorization required.' })
  const cleanId = String(id || '').trim()
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid promotion identifier.' })
  }
  const input = await bodyJson(req)
  const updateData = {
    ...(input.name !== undefined && { name: String(input.name).trim() }),
    ...(input.description !== undefined && { description: String(input.description).trim() }),
    ...(input.media_type !== undefined && { media_type: input.media_type === 'video' ? 'video' : 'image' }),
    ...(input.media_url !== undefined && { media_url: String(input.media_url).trim() }),
    ...(input.cta_text !== undefined && { cta_text: String(input.cta_text).trim() }),
    ...(input.cta_link !== undefined && { cta_link: sanitizeLink(input.cta_link) }),
    ...(input.active !== undefined && { active: Boolean(input.active) }),
    ...(input.discount_value !== undefined && { discount_value: Number(input.discount_value) }),
    updated_at: new Date().toISOString(),
  }

  if (supabaseReady()) {
    try {
      const updated = await db(`promotions?id=eq.${encodeURIComponent(cleanId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(updateData),
      })
      if (updated && updated.length > 0) {
        return json(res, 200, { success: true, promotion: updated[0] })
      }
    } catch (err) {
      console.error('Failed to update promotion in DB:', err.message)
      return json(res, 500, { error: 'Failed to update promotion in database.' })
    }
  }

  const idx = localPromotions.findIndex(p => p.id === cleanId)
  if (idx !== -1) {
    localPromotions[idx] = { ...localPromotions[idx], ...updateData }
    return json(res, 200, { success: true, promotion: localPromotions[idx] })
  }
  return json(res, 404, { error: 'Promotion not found.' })
}

export async function handleDeletePromotion(req, res, id, admin) {
  if (!admin) return json(res, 403, { error: 'Admin authorization required.' })
  const cleanId = String(id || '').trim()
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid promotion identifier.' })
  }
  if (supabaseReady()) {
    try {
      await db(`promotions?id=eq.${encodeURIComponent(cleanId)}`, { method: 'DELETE' })
      return json(res, 200, { success: true, message: 'Promotion deleted.' })
    } catch (err) {
      console.error('Failed to delete promotion in DB:', err.message)
      return json(res, 500, { error: 'Failed to delete promotion from database.' })
    }
  }

  localPromotions = localPromotions.filter(p => p.id !== cleanId)
  return json(res, 200, { success: true, message: 'Promotion deleted.' })
}

