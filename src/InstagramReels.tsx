import { useEffect, useState } from 'react'

interface InstagramReel {
  id: string
  caption: string
  permalink: string
  thumbnailUrl: string
  timestamp: string
}

function isInstagramReel(value: unknown): value is InstagramReel {
  if (!value || typeof value !== 'object') return false
  const reel = value as Record<string, unknown>
  return typeof reel.id === 'string'
    && typeof reel.caption === 'string'
    && typeof reel.permalink === 'string'
    && reel.permalink.startsWith('https://www.instagram.com/')
    && typeof reel.thumbnailUrl === 'string'
    && reel.thumbnailUrl.startsWith('https://')
    && typeof reel.timestamp === 'string'
}

function InstagramReels() {
  const [reels, setReels] = useState<InstagramReel[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let active = true
    let controller: AbortController | undefined

    const loadReels = async () => {
      controller = new AbortController()
      try {
        const response = await fetch('/api/instagram/reels', { signal: controller.signal })
        if (!response.ok) throw new Error('Instagram feed request failed')
        const payload: unknown = await response.json()
        if (!payload || typeof payload !== 'object' || !('reels' in payload) || !Array.isArray(payload.reels)) {
          throw new Error('Instagram feed response is invalid')
        }
        const nextReels = payload.reels.filter(isInstagramReel)
        if (active) {
          setReels(nextReels)
          setStatus('ready')
        }
      } catch {
        if (active && !controller?.signal.aborted) setStatus('error')
      }
    }

    void loadReels()
    const refresh = window.setInterval(() => void loadReels(), 5 * 60 * 1000)
    return () => {
      active = false
      controller?.abort()
      window.clearInterval(refresh)
    }
  }, [])

  if (status === 'loading') {
    return <p className="instagram-feed-status" aria-live="polite">Loading our latest Instagram reels…</p>
  }

  if (status === 'error') {
    return <p className="instagram-feed-status" aria-live="polite">Our Instagram reels are unavailable right now. Visit our Instagram page to see the latest posts.</p>
  }

  if (reels.length === 0) {
    return <p className="instagram-feed-status" aria-live="polite">No recent reels to show yet. Follow us on Instagram to catch our latest posts.</p>
  }

  return (
    <div className="instagram-reel-carousel" aria-label="Recent Instagram reels" tabIndex={0}>
      {reels.map((reel) => (
        <a
          className="instagram-reel-card"
          href={reel.permalink}
          target="_blank"
          rel="noreferrer"
          key={reel.id}
          aria-label={`Watch Instagram reel${reel.caption ? `: ${reel.caption}` : ''}`}
        >
          <div className="instagram-reel-image">
            <img src={reel.thumbnailUrl} alt="" loading="lazy" />
            <span className="instagram-reel-badge">REEL</span>
          </div>
          {reel.caption && <p>{reel.caption}</p>}
          {reel.timestamp && <time dateTime={reel.timestamp}>{new Date(reel.timestamp).toLocaleDateString()}</time>}
        </a>
      ))}
    </div>
  )
}

export default InstagramReels
