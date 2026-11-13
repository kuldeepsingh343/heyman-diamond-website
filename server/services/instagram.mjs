import { json } from './shared.mjs'

export function getInstagramAccountId() {
  return process.env.INSTAGRAM_ACCOUNT_ID || process.env.INSTAGRAM_USER_ID || ''
}

export function getInstagramAccessToken() {
  return process.env.INSTAGRAM_ACCESS_TOKEN || ''
}

const INSTAGRAM_GRAPH_API_VERSION = process.env.INSTAGRAM_GRAPH_API_VERSION || 'v22.0'
const INSTAGRAM_CACHE_TTL_MS = 5 * 60 * 1000

let instagramCache = { expiresAt: 0, reels: [] }

export async function fetchInstagramReels() {
  const accountId = getInstagramAccountId()
  const accessToken = getInstagramAccessToken()
  if (!accountId || !accessToken) {
    return null
  }
  const now = Date.now()
  if (instagramCache.expiresAt > now && instagramCache.reels.length > 0) {
    return instagramCache.reels
  }

  const endpoint = new URL(`https://graph.facebook.com/${INSTAGRAM_GRAPH_API_VERSION}/${encodeURIComponent(accountId)}/media`)
  endpoint.searchParams.set('fields', 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp')
  endpoint.searchParams.set('access_token', accessToken)
  endpoint.searchParams.set('limit', '12')

  const response = await fetch(endpoint, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`Instagram Graph API returned ${response.status}: ${errorBody.slice(0, 300)}`)
    throw new Error('Unable to fetch live Instagram reels')
  }

  const data = await response.json()
  const rawItems = Array.isArray(data?.data) ? data.data : []
  const reels = rawItems
    .map(item => ({
      id: item.id,
      caption: item.caption || '',
      mediaUrl: item.media_url || null,
      thumbnailUrl: item.thumbnail_url || item.media_url || null,
      permalink: item.permalink || 'https://www.instagram.com/heymandiamond_llc/',
      timestamp: item.timestamp || null,
    }))
    .filter(item => Boolean(item.thumbnailUrl))

  instagramCache = {
    expiresAt: now + INSTAGRAM_CACHE_TTL_MS,
    reels,
  }
  return reels
}

export async function handleInstagramFeed(req, res) {
  if (!getInstagramAccountId() || !getInstagramAccessToken()) {
    return json(res, 503, {
      error: 'Instagram feed is not configured.',
    })
  }

  try {
    const reels = await fetchInstagramReels()
    return json(res, 200, {
      configured: true,
      reels: reels || [],
      items: reels || [],
      count: reels?.length || 0,
      profileUrl: 'https://www.instagram.com/heymandiamond_llc/',
    })
  } catch (error) {
    console.error('Failed to load Instagram reels:', error.message)
    return json(res, 502, {
      error: 'Instagram Reels feed is temporarily unavailable. Please try again shortly.',
      configured: true,
    })
  }
}
