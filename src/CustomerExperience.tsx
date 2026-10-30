import { useState } from 'react'
import type { FormEvent } from 'react'

const googleReviews = [
  { name: 'Chicago Office', url: 'https://g.page/r/CUAb_0ORRHwlEBM/review' },
  { name: 'New York Office', url: 'https://g.page/r/CXXUn2VwmgefEBM/review' },
]

export default function CustomerExperience() {
  const [rating, setRating] = useState(0)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [remarks, setRemarks] = useState('')
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
        body: JSON.stringify({ name: name.trim(), email: email.trim(), remarks: remarks.trim(), rating }),
      })
      if (!response.ok) throw new Error('Review service unavailable')
      setStatus('Thank you. Your review has been submitted.')
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
    <>
      <section className="customer-paths" id="customer-paths" aria-labelledby="customer-paths-title">
        <div className="section-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" />A BETTER WAY TO BUY DIAMONDS</div>
            <h2 id="customer-paths-title">Made for your <em>kind of business.</em></h2>
          </div>
          <p>Whether you are sourcing for a jewelry business or choosing a diamond for yourself, start with the experience designed for you.</p>
        </div>
        <div className="customer-paths-grid">
          <article className="customer-path-card dealer">
            <div className="path-icon" aria-hidden="true">◇</div>
            <h3>Wholesale &amp; Diamond Dealers</h3>
            <p>Dedicated service for jewelry businesses and diamond trade professionals.</p>
            <ul className="path-list">
              <li>Account review for new applicants</li>
              <li>Business verification for new applicants</li>
              <li>Support for sourcing and repeat orders</li>
            </ul>
            <a className="button-primary" href="#signup-dealer">Create Dealer Account <span>↗</span></a>
          </article>
          <article className="customer-path-card">
            <div className="path-icon" aria-hidden="true">✧</div>
            <h3>General Customers</h3>
            <p>Explore diamond options with personal support and a straightforward buying experience.</p>
            <ul className="path-list">
              <li>Browse available collections</li>
              <li>Ask our team for help choosing a stone</li>
              <li>Create an account for a more personal experience</li>
            </ul>
            <a className="button-secondary" href="#signup-customer">Get Started <span>↗</span></a>
          </article>
        </div>
      <p className="account-signin-link">Already have an account? <a href="#signin">Sign in here</a>.</p>
      </section>

      <section className="review-section" id="reviews" aria-labelledby="reviews-title">
        <div className="review-layout">
          <div className="review-intro">
            <div className="eyebrow"><span className="eyebrow-line" />YOUR EXPERIENCE MATTERS</div>
            <h2 id="reviews-title">Your feedback helps us <em>shine brighter.</em></h2>
            <p>We value honest feedback. Tell us about your experience with Hey Man Diamond LLC, and help us continue improving our service.</p>
            <div className="google-review-links">
              <a className="google-review-link" href={googleReviews[0].url} target="_blank" rel="noreferrer">
                <span><strong>Give us a Google review</strong><br /><small>Chicago Office</small></span><span aria-hidden="true">↗</span>
              </a>
              <a className="google-review-link" href={googleReviews[1].url} target="_blank" rel="noreferrer">
                <span><strong>Give us a Google review</strong><br /><small>New York Office</small></span><span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
          <form className="review-form" onSubmit={submitReview}>
            <h3>Leave a review</h3>
            <p className="form-intro">Share your thoughts with our team. Your email address will not be displayed publicly.</p>
            <div className="review-field">
              <label htmlFor="review-remarks">YOUR FEEDBACK *</label>
              <textarea id="review-remarks" value={remarks} onChange={event => setRemarks(event.target.value)} maxLength={2000} placeholder="Tell us about your experience..." required />
            </div>
            <div className="review-field">
              <label id="rating-label">YOUR RATING *</label>
              <div className="star-picker" role="group" aria-labelledby="rating-label">
                {[1, 2, 3, 4, 5].map(star => (
                  <button key={star} type="button" className={star <= rating ? 'active' : ''} onClick={() => setRating(star)} aria-label={`Rate ${star} out of 5 stars`} aria-pressed={rating === star}>★</button>
                ))}
              </div>
            </div>
            <div className="review-field">
              <label htmlFor="review-name">YOUR NAME *</label>
              <input id="review-name" value={name} onChange={event => setName(event.target.value)} autoComplete="name" maxLength={120} placeholder="Enter your name" required />
            </div>
            <div className="review-field">
              <label htmlFor="review-email">EMAIL ADDRESS *</label>
              <input id="review-email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" maxLength={254} placeholder="you@example.com" required />
            </div>
            <button className="submit-review" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Review'}</button>
            {status && <p className="form-status" role="status" aria-live="polite">{status}</p>}
            <p className="review-privacy">By submitting, you confirm this feedback reflects your experience. Your email is used for review-related communication and is not shown publicly.</p>
          </form>
        </div>
      </section>
    </>
  )
}
