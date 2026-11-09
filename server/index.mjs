import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PORT,
  DIST_DIR,
  json,
  bodyJson,
  isOriginAllowed,
  getCorsHeaders,
  getAuthRedirectUrl,
  supabaseReady,
  db,
  SECURITY_HEADERS,
} from './services/shared.mjs'

import {
  handleSignup,
  handleResendConfirmation,
  handleSignin,
  handleForgotPassword,
  handleResetPassword,
  handleGetProfile,
  handleUpdateProfile,
  handleOAuth,
  handleCheckRegistered,
  requireAdmin,
  authenticatedUser,
} from './services/auth.mjs'

import {
  handleGetCatalog,
  handleUploadInventory,
  handleDownloadTemplate,
  handleFlomizStatus,
  isFlomizConfigured,
  handleGetAdminDiamonds,
  handleUpdateAdminDiamond,
  handleDeleteAdminDiamond,
  handleRestoreAdminDiamond,
  handleBatchPublishAdminDiamonds,
  handleSyncFlomizToStaging,
  handleTestFlomizConnection,
  handleUpdateFlomizConfig,
} from './services/inventory.mjs'

import {
  handleCreateQuote,
  handleCreateInquiry,
  handleGetAdminQuotes,
  handleUpdateQuoteStatus,
  handleGetUserOrders,
} from './services/quotes.mjs'

import {
  handleGetPromotions,
  handleGetAdminPromotions,
  handleCreatePromotion,
  handleUpdatePromotion,
  handleDeletePromotion,
} from './services/promotions.mjs'

import {
  handleGetReviews,
  handleCreateReview,
  handleGetAdminReviews,
  handleUpdateReviewStatus,
  handleCreateReviewReply,
  handleDeleteReview,
} from './services/reviews.mjs'

import {
  handleInstagramFeed,
} from './services/instagram.mjs'

import {
  handleGetDealerApplications,
  handleUpdateDealerApplication,
  handleGetOrders,
  handleGetStaffUsers,
  handleCreateStaffUser,
  handleUpdateStaffUser,
  handleDeleteStaffUser,
} from './services/admin.mjs'

import {
  handleGetMediaUploadUrl,
  handleConfirmMediaUpload,
  handleGetDiamondMedia,
  handleUpdateMediaItem,
  handleDeleteMediaItem,
  handleMockMediaUpload,
} from './services/media.mjs'

const server = createServer(async (req, res) => {
  const requestOrigin = req.headers.origin
  const host = req.headers.host
  if (requestOrigin && !isOriginAllowed(requestOrigin, host)) {
    return json(res, 403, { error: 'This website origin is not allowed.' })
  }

  res._corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, res._corsHeaders)
    return res.end()
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  try {
    // ── System Health ────────────────────────────────────────────────────────
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, {
        status: 'ok',
        databaseConfigured: supabaseReady(),
        flomizConfigured: isFlomizConfigured(),
        instagramConfigured: Boolean(process.env.INSTAGRAM_ACCOUNT_ID && process.env.INSTAGRAM_ACCESS_TOKEN),
        note: 'Configuration presence only; provider credentials and connectivity are not verified by this endpoint.',
      })
    }

    // ── Authentication Service ───────────────────────────────────────────────
    if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
      return await handleSignup(req, res)
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/resend-confirmation') {
      return await handleResendConfirmation(req, res)
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/signin') {
      return await handleSignin(req, res)
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/forgot-password') {
      return await handleForgotPassword(req, res)
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/reset-password') {
      return await handleResetPassword(req, res)
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/oauth') {
      return await handleOAuth(req, res, url)
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/check-registered') {
      return await handleCheckRegistered(req, res, url)
    }

    // ── User Profile & Account Services ──────────────────────────────────────
    if (req.method === 'GET' && url.pathname === '/api/user/profile') {
      return await handleGetProfile(req, res)
    }
    if (req.method === 'PUT' && url.pathname === '/api/user/profile') {
      return await handleUpdateProfile(req, res)
    }
    if (req.method === 'GET' && (url.pathname === '/api/user/orders' || url.pathname === '/api/user/quotes')) {
      return await handleGetUserOrders(req, res)
    }

    // ── Inventory & Catalog Service ──────────────────────────────────────────
    if (req.method === 'GET' && (url.pathname === '/api/catalog' || url.pathname === '/api/inventory')) {
      const user = await authenticatedUser(req).catch(() => null)
      return await handleGetCatalog(req, res, url, user)
    }
    if (req.method === 'GET' && /^\/api\/diamonds\/[a-zA-Z0-9_-]+\/media$/i.test(url.pathname)) {
      const parts = url.pathname.split('/')
      const id = parts[parts.length - 2]
      return await handleGetDiamondMedia(req, res, id)
    }
    if (req.method === 'GET' && (url.pathname === '/api/flomiz/status' || url.pathname === '/api/inventory/flomiz/status')) {
      return handleFlomizStatus(req, res)
    }
    if (req.method === 'GET' && url.pathname === '/api/inventory/template') {
      return handleDownloadTemplate(req, res)
    }
    if (req.method === 'POST' && url.pathname === '/api/inventory/upload') {
      const admin = await requireAdmin(req)
      if (!admin) return json(res, 401, { error: 'Admin authentication required.' })
      if (!admin.permissions?.can_manage_inventory) {
        return json(res, 403, { error: 'Inventory management permission required.' })
      }
      return await handleUploadInventory(req, res, admin)
    }

    // ── Quotes & Inquiries Service ───────────────────────────────────────────
    if (req.method === 'POST' && url.pathname === '/api/inquiries') {
      return await handleCreateInquiry(req, res)
    }
    if (req.method === 'POST' && url.pathname === '/api/quotes') {
      return await handleCreateQuote(req, res)
    }

    // ── Reviews Service ──────────────────────────────────────────────────────
    if (req.method === 'GET' && url.pathname === '/api/reviews') {
      return await handleGetReviews(req, res)
    }
    if (req.method === 'POST' && url.pathname === '/api/reviews') {
      return await handleCreateReview(req, res)
    }

    // ── Media / Instagram Service ────────────────────────────────────────────
    if (req.method === 'GET' && (url.pathname === '/api/instagram/feed' || url.pathname === '/api/instagram/reels')) {
      return await handleInstagramFeed(req, res)
    }

    // ── Promotions / Offers & Schemes Service ─────────────────────────────────
    if (req.method === 'GET' && url.pathname === '/api/promotions') {
      return await handleGetPromotions(req, res)
    }

    // ── Admin Gateway & Protected Sub-Services ───────────────────────────────
    if (url.pathname.startsWith('/api/admin/')) {
      const admin = await requireAdmin(req)
      if (!admin) return json(res, 401, { error: 'Sign in with an authorized administrator account.', message: 'Sign in with an authorized administrator account.' })
      const p = admin.permissions || {}

      // Admin Inventory Upload
      if (req.method === 'POST' && url.pathname === '/api/admin/inventory/upload') {
        if (!p.can_manage_inventory) return json(res, 403, { error: 'Inventory management permission required.' })
        return await handleUploadInventory(req, res, admin)
      }

      // Admin Diamonds Inventory & Price Management
      if (url.pathname.startsWith('/api/admin/diamonds') || url.pathname.startsWith('/api/admin/flomiz')) {
        if (!p.can_manage_inventory) return json(res, 403, { error: 'Inventory management permission required.' })
        if (req.method === 'GET' && url.pathname === '/api/admin/diamonds') {
          return await handleGetAdminDiamonds(req, res, admin, url)
        }
        if (req.method === 'PATCH' && url.pathname === '/api/admin/diamonds/batch-publish') {
          return await handleBatchPublishAdminDiamonds(req, res, admin)
        }
        if (req.method === 'PATCH' && /^\/api\/admin\/diamonds\/[a-zA-Z0-9_-]+$/i.test(url.pathname)) {
          const id = url.pathname.split('/').pop()
          return await handleUpdateAdminDiamond(req, res, admin, id)
        }
        if (req.method === 'DELETE' && /^\/api\/admin\/diamonds\/[a-zA-Z0-9_-]+$/i.test(url.pathname)) {
          const id = url.pathname.split('/').pop()
          return await handleDeleteAdminDiamond(req, res, admin, id)
        }
        if (req.method === 'POST' && /^\/api\/admin\/diamonds\/[a-zA-Z0-9_-]+\/restore$/i.test(url.pathname)) {
          const parts = url.pathname.split('/')
          const id = parts[parts.length - 2]
          return await handleRestoreAdminDiamond(req, res, admin, id)
        }
        if (req.method === 'POST' && /^\/api\/admin\/diamonds\/[a-zA-Z0-9_-]+\/media\/upload-url$/i.test(url.pathname)) {
          const parts = url.pathname.split('/')
          const id = parts[parts.length - 3]
          return await handleGetMediaUploadUrl(req, res, admin, id)
        }
        if ((req.method === 'POST' || req.method === 'PUT') && /^\/api\/admin\/diamonds\/[a-zA-Z0-9_-]+\/media\/mock-upload$/i.test(url.pathname)) {
          return await handleMockMediaUpload(req, res, admin)
        }
        if (req.method === 'POST' && /^\/api\/admin\/diamonds\/[a-zA-Z0-9_-]+\/media\/confirm$/i.test(url.pathname)) {
          const parts = url.pathname.split('/')
          const id = parts[parts.length - 3]
          return await handleConfirmMediaUpload(req, res, admin, id)
        }
        if (req.method === 'PATCH' && /^\/api\/admin\/diamonds\/[a-zA-Z0-9_-]+\/media\/[a-zA-Z0-9_-]+$/i.test(url.pathname)) {
          const parts = url.pathname.split('/')
          const mediaId = parts[parts.length - 1]
          const id = parts[parts.length - 3]
          return await handleUpdateMediaItem(req, res, admin, id, mediaId)
        }
        if (req.method === 'DELETE' && /^\/api\/admin\/diamonds\/[a-zA-Z0-9_-]+\/media\/[a-zA-Z0-9_-]+$/i.test(url.pathname)) {
          const parts = url.pathname.split('/')
          const mediaId = parts[parts.length - 1]
          const id = parts[parts.length - 3]
          return await handleDeleteMediaItem(req, res, admin, id, mediaId)
        }
        if (req.method === 'POST' && url.pathname === '/api/admin/diamonds/sync-flomiz') {
          return await handleSyncFlomizToStaging(req, res, admin)
        }
        if (req.method === 'POST' && url.pathname === '/api/admin/flomiz/test') {
          return await handleTestFlomizConnection(req, res, admin)
        }
        if (req.method === 'POST' && url.pathname === '/api/admin/flomiz/config') {
          return await handleUpdateFlomizConfig(req, res, admin)
        }
      }

      // Admin Quotes & Orders
      if (url.pathname.startsWith('/api/admin/quotes') || url.pathname.startsWith('/api/admin/orders')) {
        if (!p.can_manage_orders) return json(res, 403, { error: 'Order and quote management permission required.' })
        if (req.method === 'GET' && url.pathname === '/api/admin/quotes') {
          return await handleGetAdminQuotes(req, res, admin)
        }
        if (req.method === 'PATCH' && /^\/api\/admin\/quotes\/[0-9a-f-]+$/i.test(url.pathname)) {
          const id = url.pathname.split('/').pop()
          return await handleUpdateQuoteStatus(req, res, admin, id)
        }
        if (req.method === 'GET' && url.pathname === '/api/admin/orders') {
          return await handleGetOrders(req, res, admin)
        }
      }

      // Admin Reviews
      if (url.pathname.startsWith('/api/admin/reviews') || url.pathname.startsWith('/api/admin/review-replies')) {
        if (!p.can_manage_reviews) return json(res, 403, { error: 'Review management permission required.' })
        if (req.method === 'GET' && url.pathname === '/api/admin/reviews') {
          return await handleGetAdminReviews(req, res, admin)
        }
        if (req.method === 'PATCH' && /^\/api\/admin\/reviews\/[a-zA-Z0-9_-]+$/i.test(url.pathname)) {
          const id = url.pathname.split('/').pop()
          return await handleUpdateReviewStatus(req, res, admin, id)
        }
        if (req.method === 'DELETE' && /^\/api\/admin\/reviews\/[a-zA-Z0-9_-]+$/i.test(url.pathname)) {
          const id = url.pathname.split('/').pop()
          return await handleDeleteReview(req, res, admin, id)
        }
        if (req.method === 'POST' && url.pathname === '/api/admin/review-replies') {
          return await handleCreateReviewReply(req, res, admin)
        }
      }

      // Admin Dealer Applications
      if (url.pathname.startsWith('/api/admin/dealer-applications')) {
        if (!p.can_review_kyc) return json(res, 403, { error: 'Dealer application review permission required.' })
        if (req.method === 'GET' && url.pathname === '/api/admin/dealer-applications') {
          return await handleGetDealerApplications(req, res, admin)
        }
        if (req.method === 'PATCH' && /^\/api\/admin\/dealer-applications\/[0-9a-f-]+$/i.test(url.pathname)) {
          const id = url.pathname.split('/').pop()
          return await handleUpdateDealerApplication(req, res, admin, id)
        }
      }

      // Admin Promotions / Offers & Schemes
      if (url.pathname.startsWith('/api/admin/promotions')) {
        if (!p.can_manage_promotions) return json(res, 403, { error: 'Promotions management permission required.' })
        if (req.method === 'GET' && url.pathname === '/api/admin/promotions') {
          return await handleGetAdminPromotions(req, res, admin)
        }
        if (req.method === 'POST' && url.pathname === '/api/admin/promotions') {
          return await handleCreatePromotion(req, res, admin)
        }
        if ((req.method === 'PUT' || req.method === 'PATCH') && /^\/api\/admin\/promotions\/[a-zA-Z0-9_-]+$/i.test(url.pathname)) {
          const id = url.pathname.split('/').pop()
          return await handleUpdatePromotion(req, res, id, admin)
        }
        if (req.method === 'DELETE' && /^\/api\/admin\/promotions\/[a-zA-Z0-9_-]+$/i.test(url.pathname)) {
          const id = url.pathname.split('/').pop()
          return await handleDeletePromotion(req, res, id, admin)
        }
      }

      // Admin Users & Staff Role Management (Super Admin only)
      if (url.pathname.startsWith('/api/admin/users') || url.pathname.startsWith('/api/admin/staff')) {
        if (admin.role !== 'super_admin' || (!p.can_manage_users && !p.can_manage_team)) {
          return json(res, 403, { error: 'Super Administrator privilege required to manage operational staff accounts.' })
        }
        if (req.method === 'GET' && (url.pathname === '/api/admin/users' || url.pathname === '/api/admin/staff')) {
          return await handleGetStaffUsers(req, res, admin)
        }
        if (req.method === 'POST' && (url.pathname === '/api/admin/users' || url.pathname === '/api/admin/staff')) {
          return await handleCreateStaffUser(req, res, admin)
        }
        if (req.method === 'PATCH' && (/^\/api\/admin\/users\/[a-zA-Z0-9_-]+$/i.test(url.pathname) || /^\/api\/admin\/staff\/[a-zA-Z0-9_-]+$/i.test(url.pathname))) {
          const id = url.pathname.split('/').pop()
          return await handleUpdateStaffUser(req, res, admin, id)
        }
        if (req.method === 'DELETE' && (/^\/api\/admin\/users\/[a-zA-Z0-9_-]+$/i.test(url.pathname) || /^\/api\/admin\/staff\/[a-zA-Z0-9_-]+$/i.test(url.pathname))) {
          const id = url.pathname.split('/').pop()
          return await handleDeleteStaffUser(req, res, admin, id)
        }
      }

      return json(res, 404, { error: 'Admin endpoint not found.' })
    }

    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found.' })

    // Safely decode pathname to detect encoded bypass attempts (%2e = ., %2f = /)
    let decodedPath = ''
    try {
      decodedPath = decodeURIComponent(url.pathname)
    } catch {
      return json(res, 400, { error: 'Malformed URL encoding.' })
    }

    // Block path traversal attempts (..) unconditionally
    if (url.pathname.includes('..') || decodedPath.includes('..')) {
      return json(res, 404, { error: 'Not found.' })
    }

    // Allow standard RFC 8615 /.well-known/ endpoints (e.g. ACME certificates, security.txt)
    const isWellKnown = url.pathname.startsWith('/.well-known/') || decodedPath.startsWith('/.well-known/')

    // Block direct access and SPA fallback for dotfiles (.env, .git, .DS_Store, etc.)
    const hasDotfile = url.pathname.startsWith('/.') || url.pathname.includes('/.') || decodedPath.startsWith('/.') || decodedPath.includes('/.')
    if (hasDotfile && !isWellKnown) {
      return json(res, 404, { error: 'Not found.' })
    }

    // ── Static Frontend Assets Gateway ───────────────────────────────────────
    const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
    const assetPath = resolve(DIST_DIR, `.${requestedPath}`)
    if (assetPath === DIST_DIR || assetPath.startsWith(DIST_DIR + sep)) {
      try {
        const file = await readFile(assetPath)
        const types = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.webp': 'image/webp',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
        }
        res.writeHead(200, {
          'Content-Type': types[extname(assetPath)] || 'application/octet-stream',
          'Cache-Control': extname(assetPath) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
          ...SECURITY_HEADERS,
        })
        return res.end(file)
      } catch {
        if (!extname(url.pathname)) {
          const html = await readFile(resolve(DIST_DIR, 'index.html'))
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
            ...SECURITY_HEADERS,
          })
          return res.end(html)
        }
      }
    }
    return json(res, 404, { error: 'Not found.' })
  } catch (error) {
    const statusCode = error && typeof error === 'object' && 'statusCode' in error
      ? Number(error.statusCode)
      : 500
    if (statusCode >= 500) {
      console.error('API request failed:', error instanceof Error ? error.message : 'unknown error')
    }
    return json(res, statusCode === 400 || statusCode === 413 ? statusCode : 500, {
      error: statusCode === 400
        ? 'Request body must be valid JSON.'
        : statusCode === 413
          ? 'Request body is too large.'
          : 'The request could not be completed.',
    })
  }
})

const isMainModule = Boolean(process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)))
if (isMainModule) {
  server.listen(PORT, () => console.log(`Hey Man Diamond API listening on port ${PORT}`))
}

export { server, getAuthRedirectUrl, isOriginAllowed, getCorsHeaders }
