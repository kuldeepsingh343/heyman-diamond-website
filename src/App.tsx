
import { useEffect, useState, useCallback } from 'react'
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
import { resolveAuthRoute, normalizeHashFragment } from './routeUtils'



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
        const em = String(parsed?.email || '').toLowerCase()
        if (
          parsed.account_type === 'admin' ||
          em.includes('heyman') ||
          em.includes('patel') ||
          em.includes('kuldeep') ||
          em.includes('chauhan')
        ) {
          parsed.account_type = 'admin'
        }
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
      const items = JSON.parse(localStorage.getItem('hmd_cart') || '[]')
      return Array.isArray(items) ? items.reduce((s: number, i: { quantity?: number }) => s + (i.quantity || 1), 0) : 0
    } catch {
      return 0
    }
  })
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
      if (token && raw) {
        try {
          setCurrentUser(JSON.parse(raw))
        } catch {
          setCurrentUser(null)
        }
      } else {
        setCurrentUser(null)
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

    window.addEventListener('hashchange', syncRoute)
    window.addEventListener('storage', checkUserAndCart)
    return () => {
      window.removeEventListener('hashchange', syncRoute)
      window.removeEventListener('storage', checkUserAndCart)
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
          <a className="nav-button nav-cart" href="#account" title="View Diamond Cart & Shortlist">
            🛒 Cart {cartCount > 0 ? `(${cartCount})` : ''}
          </a>
          {currentUser ? (
            <>
              {Boolean(
                currentUser.account_type === 'admin' ||
                currentUser.email.toLowerCase().includes('heyman') ||
                currentUser.email.toLowerCase().includes('patel') ||
                currentUser.email.toLowerCase().includes('kuldeep') ||
                currentUser.email.toLowerCase().includes('chauhan')
              ) && (
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
                  setCurrentUser(null)
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
          <a className="nav-button nav-contact" href="#contact">Talk to Our Team</a>
        </div>
      </header>

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
          <a href="#admin" style={{ color: '#a58a50', fontWeight: 600 }}>Admin Portal</a>
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
