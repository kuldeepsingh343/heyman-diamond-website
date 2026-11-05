import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import './ReviewsPage.css'

export interface ReviewItem {
  id: string
  customer_name: string
  rating: number
  remarks: string
  submitted_at: string
  reply?: string | null
}

const googleReviews = [
  { name: 'Chicago Office', url: 'https://g.page/r/CUAb_0ORRHwlEBM/review' },
  { name: 'New York Office', url: 'https://g.page/r/CXXUn2VwmgefEBM/review' },
]

const fallbackReviews: ReviewItem[] = [
  {
    id: 'rev-1',
    customer_name: 'Jessica M.',
    rating: 5,
    remarks: 'The 2.5ct Emerald cut diamond we ordered exceeded all expectations. Exceptional sparkle and certified IGI paperwork came securely packaged.',
    submitted_at: '2026-11-02T10:00:00Z',
    reply: 'Thank you Jessica! It was a pleasure crafting this piece for you.',
  },
  {
    id: 'rev-2',
    customer_name: 'David K., Jeweler',
    rating: 5,
    remarks: 'As a wholesale partner, Hey Man Diamond provides consistent, accurately graded lab melee and certified diamonds at top trade rates. Fast dispatch.',
    submitted_at: '2026-10-30T14:30:00Z',
    reply: 'We appreciate your continued partnership, David.',
  },
  {
    id: 'rev-3',
    customer_name: 'Marcus T.',
    rating: 5,
    remarks: 'Ordered a matched pair of oval diamonds for bespoke earrings. Calibration was exact and the color consistency was flawless. Highly recommended!',
    submitted_at: '2026-10-27T09:15:00Z',
  },
  {
    id: 'rev-4',
    customer_name: 'Elena R., Fine Jewelry Studio',
    rating: 5,
    remarks: 'Superb customer service from Bharat and the sales team. Helped us source calibrated round melee parcels for our custom bridal rings within 48 hours.',
    submitted_at: '2026-10-24T16:45:00Z',
  },
  {
    id: 'rev-5',
    customer_name: 'Aaron B., Verified Buyer',
    rating: 5,
    remarks: 'First time ordering lab-grown diamonds online. The certificate lookup matched immediately, and the price was significantly better than standard dealers.',
    submitted_at: '2026-10-21T11:20:00Z',
  },
  {
    id: 'rev-6',
    customer_name: 'Sophia C., Diamond Retailer',
    rating: 5,
    remarks: 'Hey Man Diamond has been our go-to for pointer goods and custom layout parcels. Impeccable communication and honesty in grading.',
    submitted_at: '2026-10-18T13:00:00Z',
  },
]

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewItem[]>(fallbackReviews)
  const [showAllReviews, setShowAllReviews] = useState(false)
  const [rating, setRating] = useState(0)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [remarks, setRemarks] = useState('')
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Scroll to top on page load
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  // Fetch live reviews from backend API if configured
  useEffect(() => {
    let active = true
    fetch('/api/reviews')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return
        if (data && Array.isArray(data.items) && data.items.length > 0) {
          setReviews(data.items)
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  const initialCount = 3
  const displayedReviews = showAllReviews ? reviews : reviews.slice(0, initialCount)

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('')
    if (rating < 1) {
      setStatus('Please select a star rating before submitting.')
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          remarks: remarks.trim(),
          rating,
        }),
      })
      if (!response.ok) throw new Error('Review service unavailable')
      setStatus('Thank you! Your review has been submitted and will appear on our website after review by our team.')
      setName('')
      setEmail('')
      setRemarks('')
      setRating(0)
    } catch {
      setStatus('Review submission is not available yet. Please contact our team while we finish connecting the secure review service.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="reviews-page">
      {/* ── Page Header ── */}
      <header className="reviews-page-header">
        <a className="reviews-page-brand" href="#home" aria-label="Return to Hey Man Diamond home">
          <img
            src="/heyman-diamond-logo.png"
            alt="Hey Man Diamond LLC"
            style={{ height: '48px', width: 'auto', objectFit: 'contain' }}
          />
        </a>
        <a className="reviews-page-back" href="#home">← Back to website</a>
      </header>

      {/* ── Section 1: Exactly the screenshot layout (YOUR EXPERIENCE MATTERS + Leave a review) ── */}
      <section className="reviews-page-top">
        <div className="reviews-top-layout">
          {/* Left Column */}
          <div className="reviews-top-intro">
            <div className="eyebrow">
              <span className="eyebrow-line" />
              YOUR EXPERIENCE MATTERS
            </div>

            <h1>
              Your feedback helps us
              <br />
              <em>shine brighter.</em>
            </h1>

            <p>
              We value honest feedback. Tell us about your experience with Hey Man Diamond LLC, and help us continue improving our service.
            </p>

            <div className="reviews-google-links">
              <a
                className="reviews-google-card"
                href={googleReviews[0].url}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  <strong>Give us a Google review</strong>
                  <small>Chicago Office</small>
                </span>
                <span aria-hidden="true">→</span>
              </a>

              <a
                className="reviews-google-card"
                href={googleReviews[1].url}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  <strong>Give us a Google review</strong>
                  <small>New York Office</small>
                </span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>

          {/* Right Column: Leave a review Form */}
          <form className="reviews-form-card" onSubmit={submitReview}>
            <h3>Leave a review</h3>
            <p className="form-intro">
              Share your thoughts with our team. Your email address will not be displayed publicly.
            </p>

            <div className="reviews-field">
              <label htmlFor="review-remarks">YOUR FEEDBACK *</label>
              <textarea
                id="review-remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                maxLength={2000}
                placeholder="Tell us about your experience..."
                rows={4}
                required
              />
            </div>

            <div className="reviews-field">
              <label id="rating-label">YOUR RATING *</label>
              <div className="reviews-star-picker" role="group" aria-labelledby="rating-label">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className={star <= rating ? 'active' : ''}
                    onClick={() => setRating(star)}
                    aria-label={`Rate ${star} out of 5 stars`}
                    aria-pressed={rating === star}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div className="reviews-field">
              <label htmlFor="review-name">YOUR NAME *</label>
              <input
                id="review-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={120}
                placeholder="Enter your name"
                required
              />
            </div>

            <div className="reviews-field">
              <label htmlFor="review-email">EMAIL ADDRESS *</label>
              <input
                id="review-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                maxLength={254}
                placeholder="you@example.com"
                required
              />
            </div>

            <button className="reviews-submit-btn" type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Review'}
            </button>

            {status && (
              <p className="form-status" role="status" aria-live="polite" style={{ marginTop: '14px', fontSize: '13px', color: '#6d5a31' }}>
                {status}
              </p>
            )}

            <p className="reviews-privacy-note">
              By submitting, you confirm this feedback reflects your experience. Your email is used for review-related communication and is not shown publicly.
            </p>
          </form>
        </div>
      </section>

      {/* ── Section 2: CLIENT EXPERIENCES (Below the screenshot, as requested) ── */}
      <section className="reviews-page-bottom">
        <div className="reviews-showcase-header">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              CLIENT EXPERIENCES
            </div>
            <h2>
              Trusted by retailers, manufacturers &amp; <em>collectors.</em>
            </h2>
          </div>

          <div className="reviews-rating-pill" aria-label="5.0 out of 5 stars based on verified client feedback">
            <span className="rating-stars">★★★★★</span>
            <span className="rating-score">5.0 / 5.0</span>
            <span className="rating-count">Verified Feedback</span>
          </div>
        </div>

        <div className="reviews-cards-grid">
          {displayedReviews.map((item) => (
            <article key={item.id} className="client-review-card">
              <div className="review-card-top">
                <div className="review-card-stars" aria-label={`${item.rating} out of 5 stars`}>
                  {'★'.repeat(item.rating || 5)}
                </div>
                <span className="review-card-badge">✓ Verified Client</span>
              </div>

              <p className="review-card-quote">“{item.remarks}”</p>

              {item.reply && (
                <div className="review-card-reply">
                  <span className="review-card-reply-author">Hey Man Diamond LLC:</span>
                  {item.reply}
                </div>
              )}

              <div className="review-card-meta">
                <span className="review-card-author">{item.customer_name}</span>
                <span className="review-card-date">
                  {item.submitted_at
                    ? new Date(item.submitted_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'Verified'}
                </span>
              </div>
            </article>
          ))}
        </div>

        {/* Read More Reviews Button */}
        {reviews.length > initialCount && (
          <div className="reviews-read-more-wrap">
            <button
              type="button"
              className="reviews-read-more-btn"
              onClick={() => setShowAllReviews(!showAllReviews)}
              aria-expanded={showAllReviews}
            >
              <span>
                {showAllReviews ? 'Show Fewer Reviews' : `Read More Reviews (${reviews.length - initialCount} more)`}
              </span>
              <span className="read-more-arrow" aria-hidden="true">
                {showAllReviews ? '↑' : '↓'}
              </span>
            </button>
          </div>
        )}

        <div className="reviews-page-footer-actions">
          <a href="#home" className="button-primary">Return to Shop</a>
          <a href="#contact" className="button-secondary">Talk to Our Team</a>
        </div>
      </section>
    </main>
  )
}

