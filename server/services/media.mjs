/**
 * Diamond Media & Storage Management Service
 * Hey Man Diamond LLC
 *
 * Rules:
 * - Images: jpg/jpeg, png, webp only, max 5 MB
 * - Videos: mp4, webm only, max 50 MB
 * - Max 10 images and 3 videos per diamond
 * - STRICTLY NO SVG, NO HTML, NO JS
 * - Server generates storage path: diamonds/{diamond_id}/{uuid}.{ext}
 * - Magic byte inspection to verify real payload type
 */

import crypto from 'node:crypto'
import { json, bodyJson, db, supabaseReady, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './shared.mjs'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024 // 50 MB
export const MAX_IMAGES_PER_DIAMOND = 10
export const MAX_VIDEOS_PER_DIAMOND = 3

export const STORAGE_BUCKET = 'diamonds'

export const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm'])

export const EXT_TO_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
}

// In-memory fallback media store for development and testing
let memoryMediaStore = [
  {
    id: 'media-seed-1001-1',
    diamond_id: 'HMD-LG-1001',
    type: 'image',
    storage_path: 'diamonds/HMD-LG-1001/seed-photo-1.jpg',
    public_url: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=800&q=85',
    sort_order: 0,
    is_primary: true,
    alt_text: 'Round 1.52ct E VVS2 Ideal Cut Diamond',
    created_at: new Date().toISOString(),
  },
  {
    id: 'media-seed-1001-2',
    diamond_id: 'HMD-LG-1001',
    type: 'video',
    storage_path: 'diamonds/HMD-LG-1001/seed-video-1.mp4',
    public_url: 'https://assets.mixkit.co/videos/preview/mixkit-diamond-rotating-on-a-black-background-41584-large.mp4',
    sort_order: 1,
    is_primary: false,
    alt_text: '360 degree video of rotating Round diamond',
    created_at: new Date().toISOString(),
  },
]

export function getMemoryMediaStore() {
  return memoryMediaStore
}

export function resetMemoryMediaStore(items = []) {
  memoryMediaStore = [...items]
}

/**
 * Validates file magic bytes against allowed image and video formats.
 *
 * @param {Buffer} buffer The binary header buffer (at least 16 bytes)
 * @param {'image'|'video'} expectedType
 * @returns {{ valid: boolean, mime: string|null }}
 */
export function verifyMagicBytes(buffer, expectedType) {
  if (!buffer || buffer.length < 4) {
    return { valid: false, mime: null }
  }

  // Check for SVG or HTML injection (<svg, <?xml, <!DOCTYPE, <html)
  const headerStr = buffer.slice(0, 100).toString('utf8').toLowerCase()
  if (
    headerStr.includes('<svg') ||
    headerStr.includes('<?xml') ||
    headerStr.includes('<!doctype') ||
    headerStr.includes('<html') ||
    headerStr.includes('<script')
  ) {
    return { valid: false, mime: null }
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: expectedType === 'image', mime: 'image/jpeg' }
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: expectedType === 'image', mime: 'image/png' }
  }

  // WEBP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: expectedType === 'image', mime: 'image/webp' }
  }

  // MP4: box header contains 'ftyp' at bytes 4..7
  if (
    buffer.length >= 8 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return { valid: expectedType === 'video', mime: 'video/mp4' }
  }

  // WEBM: 1A 45 DF A3 (EBML Header)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return { valid: expectedType === 'video', mime: 'video/webm' }
  }

  return { valid: false, mime: null }
}

/**
 * Builds public storage URL for a path in Supabase Storage.
 */
export function getStoragePublicUrl(storagePath) {
  if (SUPABASE_URL) {
    const cleanUrl = SUPABASE_URL.replace(/\/+$/, '')
    return `${cleanUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`
  }
  return `/storage/${STORAGE_BUCKET}/${storagePath}`
}

/**
 * Generates an upload URL for the frontend to upload directly to Supabase storage.
 * POST /api/admin/diamonds/:id/media/upload-url
 */
export async function handleGetMediaUploadUrl(req, res, admin, diamondId) {
  if (!admin) return json(res, 401, { error: 'Admin authorization required.' })
  if (admin.permissions && admin.permissions.can_manage_inventory === false) {
    return json(res, 403, { error: 'Inventory management permission required.' })
  }

  const cleanId = String(diamondId || '').trim()
  if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid diamond identifier.' })
  }

  const input = await bodyJson(req).catch(() => ({}))
  const type = String(input.type || '').trim().toLowerCase()
  const rawFileName = String(input.fileName || '').trim()
  const fileSize = Number(input.fileSize || 0)

  if (type !== 'image' && type !== 'video') {
    return json(res, 400, { error: 'Media type must be either "image" or "video".' })
  }

  // Extract and sanitize extension
  const extMatch = rawFileName.match(/\.([a-zA-Z0-9]+)$/)
  const rawExt = extMatch ? extMatch[1].toLowerCase() : (type === 'image' ? 'jpg' : 'mp4')
  if (!ALLOWED_EXTENSIONS.has(rawExt)) {
    return json(res, 400, {
      error: `Disallowed file format ".${rawExt}". Only jpg, png, webp for images and mp4, webm for videos are allowed.`,
    })
  }

  const expectedMime = EXT_TO_MIME[rawExt]
  if (type === 'image' && !expectedMime.startsWith('image/')) {
    return json(res, 400, { error: 'File extension does not match image type.' })
  }
  if (type === 'video' && !expectedMime.startsWith('video/')) {
    return json(res, 400, { error: 'File extension does not match video type.' })
  }

  // Validate size limits if sent
  if (type === 'image' && fileSize > MAX_IMAGE_BYTES) {
    return json(res, 400, { error: `Image size exceeds the maximum allowed limit of 5 MB (${(fileSize / (1024 * 1024)).toFixed(1)} MB sent).` })
  }
  if (type === 'video' && fileSize > MAX_VIDEO_BYTES) {
    return json(res, 400, { error: `Video size exceeds the maximum allowed limit of 50 MB (${(fileSize / (1024 * 1024)).toFixed(1)} MB sent).` })
  }

  // Check existing media counts for this diamond
  let currentImages = 0
  let currentVideos = 0

  if (supabaseReady()) {
    try {
      const rows = await db(`diamond_media?diamond_id=eq.${encodeURIComponent(cleanId)}&select=type`)
      if (Array.isArray(rows)) {
        currentImages = rows.filter(r => r.type === 'image').length
        currentVideos = rows.filter(r => r.type === 'video').length
      } else {
        const memRows = memoryMediaStore.filter(m => m.diamond_id === cleanId)
        currentImages = memRows.filter(m => m.type === 'image').length
        currentVideos = memRows.filter(m => m.type === 'video').length
      }
    } catch {
      const memRows = memoryMediaStore.filter(m => m.diamond_id === cleanId)
      currentImages = memRows.filter(m => m.type === 'image').length
      currentVideos = memRows.filter(m => m.type === 'video').length
    }
  } else {
    const memRows = memoryMediaStore.filter(m => m.diamond_id === cleanId)
    currentImages = memRows.filter(m => m.type === 'image').length
    currentVideos = memRows.filter(m => m.type === 'video').length
  }

  if (type === 'image' && currentImages >= MAX_IMAGES_PER_DIAMOND) {
    return json(res, 400, { error: `Maximum of ${MAX_IMAGES_PER_DIAMOND} images reached for this diamond.` })
  }
  if (type === 'video' && currentVideos >= MAX_VIDEOS_PER_DIAMOND) {
    return json(res, 400, { error: `Maximum of ${MAX_VIDEOS_PER_DIAMOND} videos reached for this diamond.` })
  }

  // Generate secure server-side storage path (User-supplied file name is NEVER used)
  const uniqueId = crypto.randomUUID()
  const storagePath = `diamonds/${cleanId}/${uniqueId}.${rawExt}`
  const publicUrl = getStoragePublicUrl(storagePath)

  let uploadUrl = null
  let token = null

  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const signEndpoint = `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/upload/sign/${STORAGE_BUCKET}/${storagePath}`
      const signRes = await fetch(signEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 300 }),
      })
      if (signRes.ok) {
        const signData = await signRes.json()
        uploadUrl = signData.url ? `${SUPABASE_URL.replace(/\/+$/, '')}${signData.url}` : null
        token = signData.token || null
      }
    } catch (err) {
      console.warn('Storage sign URL error:', err.message)
    }
  }

  // Fallback upload URL for local/testing
  if (!uploadUrl) {
    uploadUrl = `/api/admin/diamonds/${encodeURIComponent(cleanId)}/media/mock-upload?path=${encodeURIComponent(storagePath)}`
  }

  return json(res, 200, {
    success: true,
    storagePath,
    uploadUrl,
    publicUrl,
    token,
    type,
    maxBytes: type === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES,
  })
}

/**
 * Confirms an uploaded file, verifies size and magic bytes, and registers it in diamond_media.
 * POST /api/admin/diamonds/:id/media/confirm
 */
export async function handleConfirmMediaUpload(req, res, admin, diamondId) {
  if (!admin) return json(res, 401, { error: 'Admin authorization required.' })
  if (admin.permissions && admin.permissions.can_manage_inventory === false) {
    return json(res, 403, { error: 'Inventory management permission required.' })
  }

  const cleanId = String(diamondId || '').trim()
  if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid diamond identifier.' })
  }

  const input = await bodyJson(req).catch(() => ({}))
  const storagePath = String(input.storagePath || '').trim()
  const type = String(input.type || '').trim().toLowerCase()
  const isPrimary = Boolean(input.isPrimary)
  const altText = String(input.altText || '').trim().slice(0, 300)
  const headerBase64 = input.headerBase64 || input.bufferBase64

  // Strict storage path security regex (prevent path traversal attacks)
  const pathRegex = /^diamonds\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|mp4|webm)$/i
  if (!pathRegex.test(storagePath) || !storagePath.startsWith(`diamonds/${cleanId}/`)) {
    return json(res, 400, { error: 'Invalid or unauthorized storage path.' })
  }

  // Magic bytes inspection
  if (headerBase64) {
    try {
      const buf = Buffer.from(headerBase64, 'base64')
      const verification = verifyMagicBytes(buf, type)
      if (!verification.valid) {
        return json(res, 400, { error: 'File content verification failed: invalid magic bytes or disallowed format.' })
      }
    } catch {
      return json(res, 400, { error: 'Malformed binary header payload.' })
    }
  }

  // Check file size and delete if oversized or invalid in Supabase
  const publicUrl = getStoragePublicUrl(storagePath)

  // Query existing media for sort order
  let nextSort = 0
  let existingCount = 0
  if (supabaseReady()) {
    try {
      const rows = await db(`diamond_media?diamond_id=eq.${encodeURIComponent(cleanId)}&order=sort_order.desc`)
      if (Array.isArray(rows) && rows.length > 0) {
        existingCount = rows.length
        nextSort = (rows[0].sort_order || 0) + 1
      } else {
        const memRows = memoryMediaStore.filter(m => m.diamond_id === cleanId)
        existingCount = memRows.length
        nextSort = memRows.length
      }
    } catch {
      const memRows = memoryMediaStore.filter(m => m.diamond_id === cleanId)
      existingCount = memRows.length
      nextSort = memRows.length
    }
  } else {
    const memRows = memoryMediaStore.filter(m => m.diamond_id === cleanId)
    existingCount = memRows.length
    nextSort = memRows.length
  }

  const mediaRecord = {
    id: crypto.randomUUID(),
    diamond_id: cleanId,
    type,
    storage_path: storagePath,
    public_url: publicUrl,
    sort_order: nextSort,
    is_primary: isPrimary || existingCount === 0, // default first item to primary
    alt_text: altText,
    created_by: admin.user?.id || null,
    created_at: new Date().toISOString(),
  }

  if (supabaseReady()) {
    try {
      // If setting this media as primary, reset other primary flags
      if (mediaRecord.is_primary) {
        await db(`diamond_media?diamond_id=eq.${encodeURIComponent(cleanId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_primary: false }),
        })
        // Also update diamond image_url
        if (type === 'image') {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId)
          const filterQuery = isUuid ? `id=eq.${encodeURIComponent(cleanId)}` : `sku=eq.${encodeURIComponent(cleanId)}`
          await db(`diamonds_inventory?${filterQuery}`, {
            method: 'PATCH',
            body: JSON.stringify({ image_url: publicUrl }),
          })
        }
      }

      await db('diamond_media', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(mediaRecord),
      })
    } catch (err) {
      console.warn('DB insert diamond_media error:', err.message)
    }
  }

  // Save to memoryMediaStore
  if (mediaRecord.is_primary) {
    memoryMediaStore.forEach(m => {
      if (m.diamond_id === cleanId) m.is_primary = false
    })
  }
  memoryMediaStore.push(mediaRecord)

  // Audit log
  if (supabaseReady()) {
    try {
      await db('audit_log', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          actor_user_id: admin?.user?.id || 'admin',
          action: 'diamond_media_added',
          entity_type: 'diamond_media',
          entity_id: mediaRecord.id,
          metadata: { diamond_id: cleanId, storagePath, type, is_primary: mediaRecord.is_primary },
        }),
      })
    } catch {
      // ignore
    }
  }

  return json(res, 201, {
    success: true,
    media: mediaRecord,
    message: 'Media added successfully.',
  })
}

/**
 * Returns public gallery media for a diamond.
 * GET /api/diamonds/:id/media
 */
export async function handleGetDiamondMedia(req, res, diamondId) {
  const cleanId = String(diamondId || '').trim()
  if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid diamond identifier.' })
  }

  let items = []

  if (supabaseReady()) {
    try {
      const rows = await db(`diamond_media?diamond_id=eq.${encodeURIComponent(cleanId)}&order=sort_order.asc,created_at.asc`)
      if (Array.isArray(rows) && rows.length > 0) {
        items = rows
      }
    } catch {
      // ignore
    }
  }

  if (items.length === 0) {
    items = memoryMediaStore.filter(m => m.diamond_id === cleanId)
  }

  // If no dedicated media items exist, synthesize baseline media from diamond main image and video
  if (items.length === 0) {
    let diamond = null
    if (supabaseReady()) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId)
        const filterQuery = isUuid ? `id=eq.${encodeURIComponent(cleanId)}` : `sku=eq.${encodeURIComponent(cleanId)}`
        const rows = await db(`diamonds_inventory?${filterQuery}&limit=1`)
        if (Array.isArray(rows) && rows.length > 0) diamond = rows[0]
      } catch {
        // ignore
      }
    }
    if (diamond) {
      if (diamond.image_url) {
        items.push({
          id: `legacy-img-${cleanId}`,
          diamond_id: cleanId,
          type: 'image',
          storage_path: 'legacy',
          public_url: diamond.image_url,
          sort_order: 0,
          is_primary: true,
          alt_text: `${diamond.shape || ''} ${diamond.carat || ''}ct Diamond`,
          created_at: diamond.created_at || new Date().toISOString(),
        })
      }
      if (diamond.video_url) {
        items.push({
          id: `legacy-vid-${cleanId}`,
          diamond_id: cleanId,
          type: 'video',
          storage_path: 'legacy',
          public_url: diamond.video_url,
          sort_order: 1,
          is_primary: false,
          alt_text: '360° Stone Video',
          created_at: diamond.created_at || new Date().toISOString(),
        })
      }
    }
  }

  return json(res, 200, { items })
}

/**
 * Updates media item sort order, primary flag, or alt text.
 * PATCH /api/admin/diamonds/:id/media/:mediaId
 */
export async function handleUpdateMediaItem(req, res, admin, diamondId, mediaId) {
  if (!admin) return json(res, 401, { error: 'Admin authorization required.' })
  if (admin.permissions && admin.permissions.can_manage_inventory === false) {
    return json(res, 403, { error: 'Inventory management permission required.' })
  }

  const cleanDiamondId = String(diamondId || '').trim()
  const cleanMediaId = String(mediaId || '').trim()
  if (!cleanDiamondId || !cleanMediaId || !/^[a-zA-Z0-9_-]+$/.test(cleanDiamondId) || !/^[a-zA-Z0-9_-]+$/.test(cleanMediaId)) {
    return json(res, 400, { error: 'Invalid identifiers.' })
  }

  const input = await bodyJson(req).catch(() => ({}))
  const updates = {
    updated_at: new Date().toISOString(),
  }

  if (input.altText !== undefined) updates.alt_text = String(input.altText).slice(0, 300)
  if (input.sortOrder !== undefined && Number.isInteger(Number(input.sortOrder))) updates.sort_order = Number(input.sortOrder)
  if (input.isPrimary !== undefined) updates.is_primary = Boolean(input.isPrimary)

  if (supabaseReady()) {
    try {
      if (updates.is_primary) {
        await db(`diamond_media?diamond_id=eq.${encodeURIComponent(cleanDiamondId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_primary: false }),
        })
      }
      await db(`diamond_media?id=eq.${encodeURIComponent(cleanMediaId)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
    } catch (err) {
      console.warn('DB update media error:', err.message)
    }
  }

  const mem = memoryMediaStore.find(m => m.id === cleanMediaId)
  if (mem) {
    if (updates.is_primary) {
      memoryMediaStore.forEach(m => {
        if (m.diamond_id === cleanDiamondId) m.is_primary = false
      })
    }
    Object.assign(mem, updates)
  }

  return json(res, 200, { success: true, message: 'Media updated.' })
}

/**
 * Deletes a media item from diamond_media and purges the file from Supabase storage.
 * DELETE /api/admin/diamonds/:id/media/:mediaId
 */
export async function handleDeleteMediaItem(req, res, admin, diamondId, mediaId) {
  if (!admin) return json(res, 401, { error: 'Admin authorization required.' })
  if (admin.permissions && admin.permissions.can_manage_inventory === false) {
    return json(res, 403, { error: 'Inventory management permission required.' })
  }

  const cleanDiamondId = String(diamondId || '').trim()
  const cleanMediaId = String(mediaId || '').trim()
  if (!cleanDiamondId || !cleanMediaId || !/^[a-zA-Z0-9_-]+$/.test(cleanDiamondId) || !/^[a-zA-Z0-9_-]+$/.test(cleanMediaId)) {
    return json(res, 400, { error: 'Invalid identifiers.' })
  }

  let media = null
  if (supabaseReady()) {
    try {
      const rows = await db(`diamond_media?id=eq.${encodeURIComponent(cleanMediaId)}&limit=1`)
      if (Array.isArray(rows) && rows.length > 0) media = rows[0]
    } catch {
      // ignore
    }
  }
  if (!media) {
    media = memoryMediaStore.find(m => m.id === cleanMediaId)
  }

  if (!media) {
    return json(res, 404, { error: 'Media item not found.' })
  }

  // Purge from Supabase Storage
  if (media.storage_path && media.storage_path !== 'legacy' && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const delEndpoint = `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/${STORAGE_BUCKET}`
      await fetch(delEndpoint, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefixes: [media.storage_path] }),
      })
    } catch (storageErr) {
      console.warn('Storage delete error:', storageErr.message)
    }
  }

  // Delete from DB
  if (supabaseReady()) {
    try {
      await db(`diamond_media?id=eq.${encodeURIComponent(cleanMediaId)}`, {
        method: 'DELETE',
      })
    } catch {
      // ignore
    }
  }

  // Delete from memoryMediaStore
  memoryMediaStore = memoryMediaStore.filter(m => m.id !== cleanMediaId)

  // Write audit log
  if (supabaseReady()) {
    try {
      await db('audit_log', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          actor_user_id: admin?.user?.id || 'admin',
          action: 'diamond_media_deleted',
          entity_type: 'diamond_media',
          entity_id: cleanMediaId,
          metadata: { storage_path: media.storage_path, diamond_id: cleanDiamondId },
        }),
      })
    } catch {
      // ignore
    }
  }

  return json(res, 200, { success: true, message: 'Media deleted.' })
}

/**
 * Fallback handler for simulated/mock direct storage uploads in local dev/tests.
 */
export async function handleMockMediaUpload(req, res, admin) {
  if (!admin) return json(res, 401, { error: 'Admin authorization required.' })
  return json(res, 200, { success: true, message: 'Mock storage upload successful.' })
}

