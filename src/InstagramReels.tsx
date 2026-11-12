import { useEffect, useState, useRef } from 'react'

interface InstagramReel {
  id: string
  permalink: string
  thumbnailUrl: string
}

const curatedReels: InstagramReel[] = [
  {
    id: 'curated-1',
    permalink: 'https://www.instagram.com/heymandiamond_llc',
    thumbnailUrl: '/loose-fancy-diamonds.jpg',
  },
  {
    id: 'curated-2',
    permalink: 'https://www.instagram.com/heymandiamond_llc',
    thumbnailUrl: '/round-melee-diamonds.jpg',
  },
  {
    id: 'curated-3',
    permalink: 'https://www.instagram.com/heymandiamond_llc',
    thumbnailUrl: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=85',
  },
  {
    id: 'curated-4',
    permalink: 'https://www.instagram.com/heymandiamond_llc',
    thumbnailUrl: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=800&q=85',
  },
  {
    id: 'curated-5',
    permalink: 'https://www.instagram.com/heymandiamond_llc',
    thumbnailUrl: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=800&q=85',
  },
  {
    id: 'curated-6',
    permalink: 'https://www.instagram.com/heymandiamond_llc',
    thumbnailUrl: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=85',
  },
  {
    id: 'curated-7',
    permalink: 'https://www.instagram.com/heymandiamond_llc',
    thumbnailUrl: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=800&q=85',
  },
  {
    id: 'curated-8',
    permalink: 'https://www.instagram.com/heymandiamond_llc',
    thumbnailUrl: 'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=800&q=85',
  },
]

function isInstagramReel(value: unknown): value is InstagramReel {
  if (!value || typeof value !== 'object') return false
  const reel = value as Record<string, unknown>
  return typeof reel.id === 'string'
    && typeof reel.permalink === 'string'
    && reel.permalink.startsWith('https://www.instagram.com/')
    && typeof reel.thumbnailUrl === 'string'
    && reel.thumbnailUrl.startsWith('https://')
}

export default function InstagramReels() {
  const [reels, setReels] = useState<InstagramReel[]>(curatedReels)
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const [isPaused, setIsPaused] = useState(false)

  // Fetch live reels from backend API if configured
  useEffect(() => {
    let active = true
    const controller = new AbortController()

    fetch('/api/instagram/reels', { signal: controller.signal })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!active) return
        if (data && Array.isArray(data.reels) && data.reels.length > 0) {
          const valid = data.reels.filter(isInstagramReel)
          if (valid.length > 0) setReels(valid)
        }
      })
      .catch(() => {})

    return () => {
      active = false
      controller.abort()
    }
  }, [])

  // Auto-slide every 3.5 seconds from right to left
  useEffect(() => {
    if (isPaused) return

    const timer = setInterval(() => {
      const el = carouselRef.current
      if (!el) return

      const card = el.firstElementChild as HTMLElement | null
      const step = card ? card.offsetWidth + 2 : 240
      const maxScroll = el.scrollWidth - el.clientWidth

      if (el.scrollLeft >= maxScroll - 15) {
        // Seamlessly return to start
        el.scrollTo({ left: 0, behavior: 'smooth' })
      } else {
        el.scrollBy({ left: step, behavior: 'smooth' })
      }
    }, 3500)

    return () => clearInterval(timer)
  }, [isPaused, reels])

  const scrollPrev = () => {
    const el = carouselRef.current
    if (!el) return
    const card = el.firstElementChild as HTMLElement | null
    const step = card ? card.offsetWidth + 2 : 240
    el.scrollBy({ left: -step, behavior: 'smooth' })
  }

  const scrollNext = () => {
    const el = carouselRef.current
    if (!el) return
    const card = el.firstElementChild as HTMLElement | null
    const step = card ? card.offsetWidth + 2 : 240
    const maxScroll = el.scrollWidth - el.clientWidth
    if (el.scrollLeft >= maxScroll - 15) {
      el.scrollTo({ left: 0, behavior: 'smooth' })
    } else {
      el.scrollBy({ left: step, behavior: 'smooth' })
    }
  }

  return (
    <div
      className="instagram-strip-container"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="instagram-strip-header">
        <a
          href="https://www.instagram.com/heymandiamond_llc"
          target="_blank"
          rel="noreferrer"
          className="instagram-strip-title"
          title="Visit @heymandiamond_llc on Instagram"
        >
          VIEW OUR INSTAGRAM
        </a>
        <div className="instagram-strip-line" />
      </div>

      <div className="instagram-slider-wrapper">
        <button
          type="button"
          className="instagram-slider-arrow instagram-slider-arrow--left"
          onClick={scrollPrev}
          aria-label="Previous reels"
        >
          ‹
        </button>

        <div
          className="instagram-slider-track"
          ref={carouselRef}
          aria-label="Instagram reels showcase"
          tabIndex={0}
        >
          {reels.map((reel) => (
            <a
              key={reel.id}
              className="instagram-slide-card"
              href={reel.permalink}
              target="_blank"
              rel="noreferrer"
              aria-label="Watch reel on Instagram"
            >
              <img
                src={reel.thumbnailUrl}
                alt="Hey Man Diamond Reel"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.onerror = null
                  e.currentTarget.src = '/certified-diamonds.jpg'
                }}
              />
              <div className="instagram-play-overlay">
                <span className="instagram-play-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </div>
            </a>
          ))}
        </div>

        <button
          type="button"
          className="instagram-slider-arrow instagram-slider-arrow--right"
          onClick={scrollNext}
          aria-label="Next reels"
        >
          ›
        </button>
      </div>
    </div>
  )
}
