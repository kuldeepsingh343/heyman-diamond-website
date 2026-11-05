import { useEffect, useState, useRef } from 'react'
import './OffersHero.css'

export interface PromotionOffer {
  id: string
  name: string
  description?: string
  media_type?: 'image' | 'video'
  media_url?: string
  cta_text?: string
  cta_link?: string
  active?: boolean
  discount_value?: number
}

const fallbackOffers: PromotionOffer[] = [
  {
    id: 'promo-1',
    name: 'Holiday Diamond Celebration',
    description: 'Exclusive wholesale incentive on certified lab-grown solitaires above 2.0 carats. Direct from our Surat & New York vaults.',
    media_type: 'image',
    media_url: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1920&q=85',
    cta_text: 'Explore Certified Stones',
    cta_link: '#collection',
    active: true,
  },
  {
    id: 'promo-2',
    name: 'Trade Volume Privilege Scheme',
    description: 'Special pricing and expedited memo dispatch on calibrated Round Melee parcels & matched pairs for certified jewelers.',
    media_type: 'image',
    media_url: 'https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=1920&q=85',
    cta_text: 'Access Trade Pricing',
    cta_link: '#signup-dealer',
    active: true,
  },
]

export default function OffersHero() {
  const [offers, setOffers] = useState<PromotionOffer[]>(fallbackOffers)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch active promotions from backend API
  useEffect(() => {
    let active = true
    fetch('/api/promotions')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!active) return
        if (data && Array.isArray(data.promotions) && data.promotions.length > 0) {
          setOffers(data.promotions)
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  // Auto-slide every 3.5 seconds (3-4 seconds requirement)
  useEffect(() => {
    if (offers.length <= 1 || isPaused) return

    autoPlayRef.current = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % offers.length)
    }, 3500)

    return () => {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current)
    }
  }, [offers.length, isPaused])

  const goNext = () => {
    setCurrentIndex(prev => (prev + 1) % offers.length)
  }

  const goPrev = () => {
    setCurrentIndex(prev => (prev - 1 + offers.length) % offers.length)
  }

  if (offers.length === 0) return null

  const current = offers[currentIndex] || offers[0]
  const isVideo = current.media_type === 'video' && current.media_url?.match(/\.(mp4|webm|mov)(\?.*)?$/i)

  return (
    <section
      className="offers-hero-section"
      id="home"
      aria-label="Latest Offers and Schemes"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background Media */}
      <div className="offers-hero-media">
        {isVideo ? (
          <video
            key={current.media_url}
            src={current.media_url}
            autoPlay
            loop
            muted
            playsInline
            className="offers-media-element offers-media-video"
          />
        ) : (
          <img
            key={current.media_url || current.id}
            src={current.media_url || fallbackOffers[0].media_url}
            alt={current.name}
            className="offers-media-element offers-media-image"
          />
        )}
        <div className="offers-media-overlay" />
      </div>

      {/* Liquid Glass Showcase Card */}
      <div className="offers-hero-content-wrapper">
        <div className="liquid-glass-card">
          <div className="liquid-glass-specular" aria-hidden="true" />
          
          <div className="liquid-glass-tag">
            <span className="glass-tag-sparkle">✦</span>
            <span>EXCLUSIVE OFFER &amp; SCHEME</span>
          </div>

          <h1 className="liquid-glass-title">{current.name}</h1>

          {current.description && (
            <p className="liquid-glass-desc">{current.description}</p>
          )}

          <div className="liquid-glass-actions">
            <a
              href={current.cta_link || '#collection'}
              className="liquid-glass-btn-primary"
            >
              <span>{current.cta_text || 'Explore Offer'}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </a>

            <a href="#contact" className="liquid-glass-btn-secondary">
              Inquire with Sales
            </a>
          </div>
        </div>
      </div>

      {/* Narrow & Slight Left / Right Navigation Buttons (Shown when >1 offer) */}
      {offers.length > 1 && (
        <>
          <button
            type="button"
            className="liquid-nav-arrow liquid-nav-arrow--left"
            onClick={goPrev}
            aria-label="Previous offer"
            title="Previous offer"
          >
            ‹
          </button>

          <button
            type="button"
            className="liquid-nav-arrow liquid-nav-arrow--right"
            onClick={goNext}
            aria-label="Next offer"
            title="Next offer"
          >
            ›
          </button>

          {/* Liquid Glass Dots */}
          <div className="liquid-glass-dots" aria-label="Offer slides">
            {offers.map((offer, idx) => (
              <button
                key={offer.id || idx}
                type="button"
                className={`liquid-dot ${idx === currentIndex ? 'liquid-dot--active' : ''}`}
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Go to offer ${idx + 1}: ${offer.name}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
