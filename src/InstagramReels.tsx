import { useEffect, useState } from 'react'

interface InstagramReel {
  id: string
  caption: string
  permalink: string
  thumbnailUrl: string
  timestamp: string
}

const curatedReels: InstagramReel[] = [
  {
    id: 'curated-1',
    caption: 'Pure fire and brilliance. Certified Oval lab-grown solitaire showcase.',
    permalink: 'https://www.instagram.com/heymandiamond_llc',
    thumbnailUrl: '/loose-fancy-diamonds.png',
    timestamp: '2026-11-01T12:00:00Z',
  },
  {
    id: 'curated-2',
    caption: 'Precision calibrated Round Melee parcels ready for custom jewelry settings.',
    permalink: 'https://www.instagram.com/heymandiamond_llc',
    thumbnailUrl: 'https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=900&q=85',
    timestamp: '2026-10-28T14:30:00Z',
  },
  {
    id: 'curated-3',
    caption: 'Radiant and Emerald cuts with extraordinary VVS clarity and ideal polish.',
    permalink: 'https://www.instagram.com/heymandiamond_llc',
    thumbnailUrl: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=85',
    timestamp: '2026-10-25T10:15:00Z',
  },
  {
    id: 'curated-4',
    caption: 'Vivid Pink and Fancy Yellow lab-grown diamonds. Ethical luxury redefined.',
    permalink: 'https://www.instagram.com/heymandiamond_llc',
    thumbnailUrl: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=900&q=85',
    timestamp: '2026-10-20T16:45:00Z',
  },
]

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
          setReels(nextReels.length > 0 ? nextReels : curatedReels)
          setStatus('ready')
        }
      } catch {
        if (active && !controller?.signal.aborted) {
          setReels(curatedReels)
          setStatus('ready')
        }
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
