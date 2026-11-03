
import { useEffect, useState } from 'react'
import './App.css'
import CustomerExperience from './CustomerExperience'
import PolicyPages from './PolicyPages'
import AuthPages from './AuthPages'
import type { UserProfile } from './AuthPages'
import InstagramReels from './InstagramReels'
import { resolveAuthRoute, normalizeHashFragment } from './routeUtils'

const categories = [
  {
    number: '01',
    name: 'Loose Fancy Diamonds',
    description: 'Explore fancy shapes and distinctive diamond styles.',
    image: '/loose-fancy-diamonds.png',
  },
  {
    number: '02',
    name: 'Round Melee Diamonds',
    description: 'Round diamonds for jewelry manufacturing and design.',
    image:
      'https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=900&q=85',
  },
  {
    number: '03',
    name: 'Certified Diamonds',
    description: 'Explore certified stones and ask our team for details.',
    image:
      'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=85',
  },
  {
    number: '04',
    name: 'Color Non Cert Diamonds',
    description: 'Ask us about available colors, sizes, and specifications.',
    image:
      'https://images.unsplash.com/photo-1603561596112-db6e5e4e9a7d?auto=format&fit=crop&w=900&q=85',
  },
  {
    number: '05',
    name: 'Match Pairs',
    description: 'Find matching diamond pairs for your next design.',
    image:
      'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=900&q=85',
  },
]

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
    email: 'heymandiamonllc@gmail.com',
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
        return JSON.parse(raw)
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
    const match = window.location.hash.match(/^#policy-(shipping|returns|privacy|terms|faq|sizing)$/)
    return match?.[1] ?? ''
  })

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
      const match = window.location.hash.match(/^#policy-(shipping|returns|privacy|terms|faq|sizing)$/)
      setPolicySlug(match?.[1] ?? '')
      setAuthRoute(resolveAuthRoute())
      if (match) window.scrollTo({ top: 0, behavior: 'auto' })
    }

    window.addEventListener('hashchange', syncRoute)
    window.addEventListener('storage', checkUserAndCart)
    return () => {
      window.removeEventListener('hashchange', syncRoute)
      window.removeEventListener('storage', checkUserAndCart)
    }
  }, [])

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

      <section className="hero" id="home">
        <div className="hero-content">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            EXCEPTIONAL DIAMONDS. PERSONAL SERVICE.
          </div>

          <h1>
            A brilliance
            <br />
            all your <em>own.</em>
          </h1>

          <p className="hero-description">
            Discover lab-grown diamonds selected with care. From
            individual purchases to wholesale partnerships, our team
            is here to help you find the right stone.
          </p>

          <div className="hero-actions">
            <a className="button-primary" href="#collection">
              Explore Our Diamonds
            </a>
            <a className="button-secondary" href="#contact">
              Meet Our Team
            </a>
          </div>

          <div className="hero-note">
            <span className="status-dot" />
            Serving retail customers and diamond professionals
          </div>
        </div>

        <div className="hero-art">
          <img
            className="hero-photo"
            src="https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1400&q=90"
            alt="Close-up of a diamond jewelry piece"
          />
          <div className="hero-photo-caption">
            <span>THE ART OF BRILLIANCE</span>
            <span>LAB-GROWN DIAMONDS</span>
          </div>
        </div>
      </section>

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

      <section className="about-section" id="about">
        <div className="about-copy">
          <h2>WHO WE ARE</h2>
          <p>
            One of the leading suppliers of grown diamonds, located in the
            Diamond District of India. Trusted by thousands of retailers,
            jewelry manufacturers, and repair shops across North America.
          </p>
          <p>
            At HeyMan Diamond LLC, we strive to understand customer’s
            requirements and give our best to provide impeccable customer
            service to all our clients. All our team members have in-depth
            knowledge of the product, as customer satisfaction is our
            top-most priority.
          </p>
          <p>
            We are a one stop shop for all your lab grown diamond requirements.
          </p>
          <p>
            Our inventory includes Melees, Pointers, Certified Inventory, Fancy
            shape Layout and Colored lab grown diamonds (Pink, Yellow, Blue,
            Green).
          </p>
          <p>
            Along with wholesale we provide service orders and bagging service.
          </p>
        </div>
      </section>

      <section className="collection" id="collection">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              FIND YOUR PERFECT STONE
            </div>
            <h2>
              Explore our <em>diamond</em> collections.
            </h2>
          </div>
          <p>
            From individual stones to matching pairs, explore our
            categories and contact our team about availability.
          </p>
        </div>

        <div className="category-grid">
          {categories.map((category) => (
            <a
              className="category-card"
              href="#contact"
              key={category.number}
            >
              <div className="category-image-wrap">
                <img
                  className="category-image"
                  src={category.image}
                  alt=""
                  loading="lazy"
                />
                <span className="category-number">{category.number}</span>
              </div>
              <div className="category-copy">
                <h3>{category.name}</h3>
                <p>{category.description}</p>
                <span className="text-link">Ask about availability</span>
              </div>
            </a>
          ))}
        </div>
      </section>

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

      <section className="team-section" id="team">
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

      <section className="social-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              FOLLOW OUR JOURNEY
            </div>
            <h2>
              A little more <em>brilliance.</em>
            </h2>
          </div>
          <a
            className="text-link"
            href="https://www.instagram.com/heymandiamond_llc"
            target="_blank"
            rel="noreferrer"
          >
            Follow us on Instagram
          </a>
        </div>

        <InstagramReels />
      </section>

      <CustomerExperience />

      <section className="contact-banner" id="contact">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" />
            LET'S TALK DIAMONDS
          </div>
          <h2>
            Have something <em>in mind?</em>
          </h2>
          <p>
            Tell us what you are looking for. Our sales team will help
            you with available options and the next steps.
          </p>
        </div>
        <a className="button-primary" href="mailto:sales@heymandiamond.com">
          Contact Sales
        </a>
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
          <a href="#policy-shipping">Shipping &amp; Delivery</a>
          <a href="#policy-returns">Returns &amp; Refunds</a>
          <a href="#policy-privacy">Privacy Policy</a>
          <a href="#policy-terms">Terms of Service</a>
          <a href="#policy-faq">FAQ</a>
          <a href="#policy-sizing">Ring Sizing Guide</a>
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
