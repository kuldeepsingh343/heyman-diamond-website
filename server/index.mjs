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
} from './services/shared.mjs'

import {
  handleSignup,
  handleResendConfirmation,
  handleSignin,
  handleForgotPassword,
  handleGetProfile,
  handleUpdateProfile,
  handleOAuth,
  requireAdmin,
  authenticatedUser,
} from './services/auth.mjs'

import {
  handleGetCatalog,
  handleUploadInventory,
  handleDownloadTemplate,
  handleFlomizStatus,
  isFlomizConfigured,
} from './services/inventory.mjs'

import {
  handleCreateQuote,
  handleCreateInquiry,
  handleGetAdminQuotes,
  handleUpdateQuoteStatus,
  handleGetUserOrders,
} from './services/quotes.mjs'

import {
  handleGetReviews,
  handleCreateReview,
  handleGetAdminReviews,
  handleUpdateReviewStatus,
  handleCreateReviewReply,
} from './services/reviews.mjs'

import {
  handleInstagramFeed,
} from './services/instagram.mjs'

import {
  handleGetDealerApplications,
  handleUpdateDealerApplication,
  handleGetOrders,
  handleGetPromotions,
} from './services/admin.mjs'

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
    if (req.method === 'GET' && url.pathname === '/api/auth/oauth') {
      return await handleOAuth(req, res, url)
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
    if (req.method === 'GET' && (url.pathname === '/api/flomiz/status' || url.pathname === '/api/inventory/flomiz/status')) {
      return handleFlomizStatus(req, res)
    }
    if (req.method === 'GET' && url.pathname === '/api/inventory/template') {
      return handleDownloadTemplate(req, res)
    }
    if (req.method === 'POST' && url.pathname === '/api/inventory/upload') {
      const admin = await requireAdmin(req)
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

    // ── Admin Gateway & Protected Sub-Services ───────────────────────────────
    if (url.pathname.startsWith('/api/admin/')) {
      const admin = await requireAdmin(req)
      if (!admin) return json(res, 401, { error: 'Sign in with an authorized administrator account.' })
      const p = admin.permissions

      // Admin Inventory Upload
      if (req.method === 'POST' && url.pathname === '/api/admin/inventory/upload') {
        return await handleUploadInventory(req, res, admin)
      }

      // Admin Quotes
      if (req.method === 'GET' && url.pathname === '/api/admin/quotes') {
        return await handleGetAdminQuotes(req, res, admin)
      }
      if (req.method === 'PATCH' && /^\/api\/admin\/quotes\/[0-9a-f-]+$/i.test(url.pathname)) {
        const id = url.pathname.split('/').pop()
        return await handleUpdateQuoteStatus(req, res, admin, id)
      }

      // Admin Reviews
      if (req.method === 'GET' && url.pathname === '/api/admin/reviews') {
        return await handleGetAdminReviews(req, res, admin)
      }
      if (req.method === 'PATCH' && /^\/api\/admin\/reviews\/[0-9a-f-]+$/i.test(url.pathname)) {
        const id = url.pathname.split('/').pop()
        return await handleUpdateReviewStatus(req, res, admin, id)
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/review-replies') {
        return await handleCreateReviewReply(req, res, admin)
      }

      // Admin Dealer Applications
      if (req.method === 'GET' && url.pathname === '/api/admin/dealer-applications') {
        return await handleGetDealerApplications(req, res, admin)
      }
      if (req.method === 'PATCH' && /^\/api\/admin\/dealer-applications\/[0-9a-f-]+$/i.test(url.pathname)) {
        const id = url.pathname.split('/').pop()
        return await handleUpdateDealerApplication(req, res, admin, id)
      }

      // Admin Orders
      if (req.method === 'GET' && url.pathname === '/api/admin/orders') {
        return await handleGetOrders(req, res, admin)
      }

      // Admin Promotions
      if (req.method === 'GET' && url.pathname === '/api/admin/promotions') {
        return await handleGetPromotions(req, res, admin)
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
            name,
            public_code: input.publicCode ? String(input.publicCode).trim().toUpperCase().slice(0, 50) : null,
            description: String(input.description || '').slice(0, 1000),
            discount_kind: kind,
            discount_value: value,
            eligibility: input.eligibility && typeof input.eligibility === 'object' ? input.eligibility : {},
            starts_at: input.startsAt || null,
            ends_at: input.endsAt || null,
            max_redemptions: input.maxRedemptions ? Number(input.maxRedemptions) : null,
            combinable: input.combinable === true,
            banner_enabled: input.bannerEnabled === true,
            banner_text: String(input.bannerText || '').slice(0, 250),
            active: input.active === true,
            created_by: admin.user.id,
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

    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found.' })

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
        })
        return res.end(file)
      } catch {
        if (!extname(url.pathname)) {
          const html = await readFile(resolve(DIST_DIR, 'index.html'))
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
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
