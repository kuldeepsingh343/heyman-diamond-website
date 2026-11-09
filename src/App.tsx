
import { useEffect, useState, useCallback, useRef } from 'react'
import './App.css'
import CustomerExperience from './CustomerExperience'
import PolicyPages from './PolicyPages'
import AuthPages from './AuthPages'
import AboutPage from './AboutPage'
import ReviewsSection from './ReviewsSection'
import DiamondCollection from './DiamondCollection'
import type { UserProfile } from './AuthPages'
import InstagramReels from './InstagramReels'
import OffersHero from './OffersHero'
import { resolveAuthRoute, normalizeHashFragment, isStaffOrAdmin } from './routeUtils'

export interface AddedToCartEventDetail {
  diamond: {
    sku: string
    shape: string
    carat: number | string
    color?: string
    clarity?: string
    cut?: string
    price: number
    certificateNumber?: string
    imageUrl?: string | null
  }
  totalItems: number
  subtotal: number
}



const team = [
  {
    name: 'Amy',
    role: 'Sales Manager',
    email: 'amy@heymandiamond.com',
    extension: 'Ext. 105',
  },
  {
    name: 'Nikky',
    role: 'Sales Manager',
    email: 'nikky@heymandiamond.com',
    extension: 'Ext. 103',
  },
  {
    name: 'Bharat Kumar Patel',
    role: 'Owner',
    email: 'heymandiamondllc@gmail.com',
    extension: 'Ext. 101',
  },
]

function App() {
  const [authRoute, setAuthRoute] = useState(() => resolveAuthRoute())
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    if (typeof window === 'undefined') return null
    const token = localStorage.getItem('hmd_access_token')
    const raw = localStorage.getItem('hmd_user')
    if (token && raw) {
      try {
        const parsed = JSON.parse(raw)
        return parsed
      } catch {
        return null
      }
    }
    return null
  })
  const [cartCount, setCartCount] = useState(() => {
    if (typeof window === 'undefined') return 0
    try {
      const token = localStorage.getItem('hmd_access_token')
      const raw = localStorage.getItem('hmd_user')
      const isGuestActive = sessionStorage.getItem('hmd_guest_cart_active') === 'true'
      if (!token && !raw && !isGuestActive) {
        localStorage.removeItem('hmd_cart')
        return 0
      }
      const items = JSON.parse(localStorage.getItem('hmd_cart') || '[]')
      return Array.isArray(items) ? items.reduce((s: number, i: { quantity?: number }) => s + (i.quantity || 1), 0) : 0
    } catch {
      return 0
    }
  })
  const [cartToast, setCartToast] = useState<AddedToCartEventDetail | null>(null)
  const [cartBumping, setCartBumping] = useState(false)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [policySlug, setPolicySlug] = useState(() => {
    const match = window.location.hash.match(/^#policy-(shipping|returns|privacy|terms|faq)$/)
    return match?.[1] ?? ''
  })
  const [isAbout, setIsAbout] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.location.hash === '#about'
  })

  const refreshCart = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      const items = JSON.parse(localStorage.getItem('hmd_cart') || '[]')
      setCartCount(Array.isArray(items) ? items.reduce((s: number, i: { quantity?: number }) => s + (i.quantity || 1), 0) : 0)
    } catch {
      setCartCount(0)
    }
  }, [])

  useEffect(() => {
    const normalizeCurrentHash = () => {
      if (typeof window === 'undefined') return
      const currentHash = window.location.hash
      const normalized = normalizeHashFragment(currentHash)
      if (normalized && normalized !== currentHash) {
        window.history.replaceState(null, '', window.location.pathname + normalized)
      }
    }

    normalizeCurrentHash()

    if (window.location.hash === '#reviews') {
      setTimeout(() => {
        document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }

    const checkUserAndCart = () => {
      if (typeof window === 'undefined') return
      const token = localStorage.getItem('hmd_access_token')
      const raw = localStorage.getItem('hmd_user')
      const isGuestActive = sessionStorage.getItem('hmd_guest_cart_active') === 'true'
      if (token && raw) {
        try {
          setCurrentUser(JSON.parse(raw))
        } catch {
          setCurrentUser(null)
        }
      } else {
        setCurrentUser(null)
        if (!isGuestActive) {
          localStorage.removeItem('hmd_cart')
          setCartCount(0)
          return
        }
      }

      try {
        const items = JSON.parse(localStorage.getItem('hmd_cart') || '[]')
        setCartCount(Array.isArray(items) ? items.reduce((s: number, i: { quantity?: number }) => s + (i.quantity || 1), 0) : 0)
      } catch {
        setCartCount(0)
      }
    }

    const syncRoute = () => {
      normalizeCurrentHash()
      checkUserAndCart()
      const match = window.location.hash.match(/^#policy-(shipping|returns|privacy|terms|faq)$/)
      setPolicySlug(match?.[1] ?? '')
      setIsAbout(window.location.hash === '#about')
      setAuthRoute(resolveAuthRoute())
      if (match || window.location.hash === '#about') {
        window.scrollTo({ top: 0, behavior: 'auto' })
      } else if (window.location.hash === '#reviews') {
        setTimeout(() => {
          document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })
        }, 50)
      }
    }

    const handleCartAdded = (e: Event) => {
      const detail = (e as CustomEvent<AddedToCartEventDetail>).detail
      if (detail) {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
        setCartToast(detail)
        setCartBumping(true)
        setTimeout(() => setCartBumping(false), 700)
        checkUserAndCart()
        toastTimeoutRef.current = setTimeout(() => {
          setCartToast(null)
        }, 5500)
      }
    }

    window.addEventListener('hashchange', syncRoute)
    window.addEventListener('storage', checkUserAndCart)
    window.addEventListener('hmd-cart-added', handleCartAdded)
    return () => {
      window.removeEventListener('hashchange', syncRoute)
      window.removeEventListener('storage', checkUserAndCart)
      window.removeEventListener('hmd-cart-added', handleCartAdded)
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    }
  }, [])

  if (isAbout) return <AboutPage />
  if (policySlug) return <PolicyPages slug={policySlug} />
  if (authRoute) return <AuthPages key={authRoute} mode={authRoute} onUserChange={setCurrentUser} />

  return (
    <main className="website">
      <div className="announcement">
        LAB-GROWN DIAMONDS <span>·</span> HARVESTING DREAMS, TOGETHER
      </div>

      <header className="navbar">
        <a className="brand" href="#home" aria-label="Hey Man Diamond home">
          <img
            className="brand-logo"
            src="/heyman-diamond-logo.png"
            alt="Hey Man Diamond LLC — Harvesting Dreams, Together"
          />
        </a>

        <nav className="nav-links" aria-label="Main navigation">
          <a href="#home">Home</a>
          <a href="#collection">Diamonds</a>
          <a href="#wholesale">Wholesale</a>
          <a href="#about">About</a>
          <a href="#reviews">Reviews</a>
          <a href="#customer-paths-title">For Customers</a>
          <a href="#contact">Contact</a>
        </nav>

        <div className="nav-actions">
          <a
            className={`nav-button nav-cart ${cartBumping ? 'nav-cart--bumping' : ''}`}
            href="#account"
            onClick={() => {
              localStorage.setItem('hmd_active_tab', 'cart')
              window.dispatchEvent(new Event('hmd-switch-tab'))
            }}
            title="View Diamond Cart & Shortlist"
          >
            <span className="nav-cart-icon-wrap">
              <svg
                className="nav-cart-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              </svg>
              <span className={`nav-cart-badge ${cartCount > 0 ? 'nav-cart-badge--active' : ''}`}>
                {cartCount}
              </span>
            </span>
            <span className="nav-cart-text">Cart</span>
          </a>
          {currentUser ? (
            <>
              {isStaffOrAdmin(currentUser) && (
                <a className="nav-button nav-admin" href="#admin" style={{ background: '#a58a50', color: '#ffffff', fontWeight: 600 }}>
                  🛡️ Admin Panel
                </a>
              )}
              <a className="nav-button nav-account" href="#account" title={currentUser.email}>
                👤 {currentUser.full_name || currentUser.email.split('@')[0]}
              </a>
              <button
                type="button"
                className="nav-button nav-signout"
                onClick={() => {
                  localStorage.removeItem('hmd_access_token')
                  localStorage.removeItem('hmd_refresh_token')
                  localStorage.removeItem('hmd_user')
                  localStorage.removeItem('hmd_cart')
                  localStorage.removeItem('hmd_active_tab')
                  sessionStorage.removeItem('hmd_guest_cart_active')
                  setCurrentUser(null)
                  setCartCount(0)
                  window.dispatchEvent(new Event('storage'))
                  window.location.hash = '#home'
                }}
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <a className="nav-button nav-signin" href="#signin">Sign In</a>
              <a className="nav-button nav-signup" href="#signup-customer">Sign Up</a>
            </>
          )}
          <a
            className={`nav-button nav-contact ${currentUser ? 'nav-contact--logged-in' : ''}`}
            href="#contact"
          >
            Talk to Our Team
          </a>
        </div>
      </header>

      {/* ── Amazon-style Added-to-Cart Confirmation Flyout ── */}
      {cartToast && (
        <aside
          className="amazon-cart-toast"
          role="dialog"
          aria-label="Added to Cart Confirmation"
          onMouseEnter={() => {
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
          }}
          onMouseLeave={() => {
            toastTimeoutRef.current = setTimeout(() => setCartToast(null), 3000)
          }}
        >
          <div className="amazon-toast-header">
            <span className="amazon-toast-success-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Added to Cart
            </span>
            <button
              type="button"
              className="amazon-toast-close"
              onClick={() => setCartToast(null)}
              aria-label="Close notification"
            >
              ✕
            </button>
          </div>

          <div className="amazon-toast-body">
            <div className="amazon-toast-product-row">
              {cartToast.diamond.imageUrl ? (
                <img
                  src={cartToast.diamond.imageUrl}
                  alt={`${cartToast.diamond.shape} Diamond`}
                  className="amazon-toast-thumb"
                />
              ) : (
                <div className="amazon-toast-thumb-placeholder">💎</div>
              )}
              <div className="amazon-toast-details">
                <h4 className="amazon-toast-title">
                  {cartToast.diamond.carat}ct {cartToast.diamond.shape} Diamond
                </h4>
                <div className="amazon-toast-specs">
                  Color: {cartToast.diamond.color || 'F'} · Clarity: {cartToast.diamond.clarity || 'VS1'} · Cut: {cartToast.diamond.cut || 'Excellent'}
                </div>
                <div className="amazon-toast-sku">
                  SKU: {cartToast.diamond.sku} {cartToast.diamond.certificateNumber ? `· Cert: ${cartToast.diamond.certificateNumber}` : ''}
                </div>
                <div className="amazon-toast-item-price">
                  ${cartToast.diamond.price.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="amazon-toast-subtotal-box">
              <span>
                Cart subtotal (<strong>{cartToast.totalItems} {cartToast.totalItems === 1 ? 'item' : 'items'}</strong>):
              </span>
              <strong className="amazon-subtotal-price">
                ${cartToast.subtotal.toLocaleString()}
              </strong>
            </div>

            <div className="amazon-toast-actions">
              <a
                href="#account"
                className="amazon-toast-primary-btn"
                onClick={() => {
                  localStorage.setItem('hmd_active_tab', 'cart')
                  setCartToast(null)
                  window.dispatchEvent(new Event('hmd-switch-tab'))
                }}
              >
                View Cart & Request Quote ({cartToast.totalItems}) →
              </a>
              <button
                type="button"
                className="amazon-toast-secondary-btn"
                onClick={() => setCartToast(null)}
              >
                Continue Browsing
              </button>
            </div>
          </div>

          <div className="amazon-toast-progress">
            <div className="amazon-toast-progress-bar" />
          </div>
        </aside>
      )}

      <OffersHero />

      <section className="trust-strip">
        <div>
          <span className="trust-number">01</span>
          <p>
            <strong>Thoughtful Selection</strong>
            <small>Diamonds for different needs and designs</small>
          </p>
        </div>
        <div>
          <span className="trust-number">02</span>
          <p>
            <strong>Retail & Wholesale</strong>
            <small>Service for customers and trade partners</small>
          </p>
        </div>
        <div>
          <span className="trust-number">03</span>
          <p>
            <strong>Personal Support</strong>
            <small>A real sales team ready to help</small>
          </p>
        </div>
      </section>

      <DiamondCollection currentUser={currentUser} onCartChange={refreshCart} />

      <section className="wholesale-section" id="wholesale">
        <div className="wholesale-image">
          <img
            src="https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=1200&q=85"
            alt="Fine jewelry detail"
            loading="lazy"
          />
        </div>
        <div className="wholesale-copy">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            FOR DIAMOND PROFESSIONALS
          </div>
          <h2>
            A trusted partner for your <em>business.</em>
          </h2>
          <p>
            Looking for wholesale lab-grown diamonds? Contact our team
            to discuss your requirements and request access to our
            wholesale services.
          </p>
          <a className="button-primary" href="mailto:sales@heymandiamond.com?subject=Wholesale%20Account%20Inquiry">
            Ask About Wholesale
          </a>
        </div>
      </section>

      <section className="team-section" id="contact">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              HERE TO HELP
            </div>
            <h2>
              Personal service. <em>Real people.</em>
            </h2>
          </div>
          <p>
            Connect directly with our team for diamond inquiries,
            availability, and order requests.
          </p>
        </div>

        <div className="team-grid">
          {team.map((member) => (
            <article className="team-card" key={member.email}>
              <div className="team-initial" aria-hidden="true">
                {member.name === 'Bharat Kumar Patel'
                  ? 'BP'
                  : member.name.charAt(0)}
              </div>
              <h3>{member.name}</h3>
              <p className="team-role">{member.role}</p>
              <a href={`mailto:${member.email}`}>{member.email}</a>
              <small>Phone: +1 312 646-0070 · {member.extension}</small>
            </article>
          ))}
        </div>
      </section>

      <CustomerExperience />

      <ReviewsSection />

      <section className="instagram-section" id="instagram">
        <InstagramReels />
      </section>

      <footer className="footer">
        <a className="brand footer-brand" href="#home">
          <img
            className="brand-logo"
            src="/heyman-diamond-logo.png"
            alt="Hey Man Diamond LLC — Harvesting Dreams, Together"
          />
        </a>

        <div className="footer-contact">
          <strong>Contact</strong>
          <a href="mailto:sales@heymandiamond.com">
            sales@heymandiamond.com
          </a>
          <a href="tel:+13126460070">+1 312 646 0070</a>
          <div className="footer-socials">
            <a
              href="https://wa.me/13127202099"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Contact us on WhatsApp"
              title="WhatsApp"
            >
              <i className="fa-brands fa-whatsapp" aria-hidden="true"></i>
            </a>

            <a
              href="https://www.facebook.com/people/HeyMan-Diamond-LLC/61578310356950/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Visit our Facebook page"
              title="Facebook"
            >
              <i className="fa-brands fa-facebook-f" aria-hidden="true"></i>
            </a>

            <a
              href="https://www.instagram.com/heymandiamond_llc"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Visit our Instagram page"
              title="Instagram"
            >
              <i className="fa-brands fa-instagram" aria-hidden="true"></i>
            </a>
          </div>
        </div>


        <div className="footer-contact footer-offices">
          <strong>Our Offices</strong>

          <span>
            <b>New York Office:</b> 23 W 47th St., #502,
            New York, NY 10063, USA
          </span>

          <span>
            <b>Chicago Office:</b> 5 S Wabash Ave, #1704,
            Chicago, IL 60603, USA
          </span>



        </div>

        <nav className="footer-policy-links" aria-label="Policies and customer help">
          <a href="#about">About Us</a>
          <a href="#reviews">Reviews</a>
          <a href="#policy-shipping">Shipping &amp; Delivery</a>
          <a href="#policy-returns">Returns &amp; Refunds</a>
          <a href="#policy-privacy">Privacy Policy</a>
          <a href="#policy-terms">Terms of Service</a>
          <a href="#policy-faq">FAQ</a>
          {isStaffOrAdmin(currentUser) && (
            <a href="#admin" style={{ color: '#a58a50', fontWeight: 600 }}>Admin Portal</a>
          )}
        </nav>

        <div className="footer-bottom">
          <span>© 2026 HEY MAN DIAMOND LLC. ALL RIGHTS RESERVED.</span>
          <span>Made with ❤️ by Kuldeep Singh Chauhan</span>
        </div>
      </footer>
    </main>
  )
}

export default App
