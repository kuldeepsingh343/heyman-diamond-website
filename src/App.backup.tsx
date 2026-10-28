
import './App.css'

function App() {
  return (
    <main className="website">
      <div className="announcement">
        Lab-Grown Diamonds · Harvesting Dreams, Together
      </div>

      <header className="navbar">
        <a className="brand" href="#home">
          <span className="brand-mark">H</span>
          <span>
            <strong>HEY MAN DIAMOND LLC</strong>
            <small>Harvesting Dreams, Together</small>
          </span>
        </a>

        <nav className="nav-links">
          <a href="#home">Home</a>
          <a href="#collection">Diamonds</a>
          <a href="#about">Our Story</a>
          <a href="#contact">Contact</a>
        </nav>

        <a className="nav-button" href="#collection">
          Explore Diamonds <span>↗</span>
        </a>
      </header>

      <section className="hero" id="home">
        <div className="hero-content">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            EXCEPTIONAL DIAMONDS. PERSONAL SERVICE.
          </div>

          <h1>
            Brilliance that
            <br />
            speaks <em>for itself.</em>
          </h1>

          <p className="hero-description">
            Discover exceptional diamonds selected with care.
            From individual purchases to wholesale partnerships,
            find the right stone with a team you can trust.
          </p>

          <div className="hero-actions">
            <a className="button-primary" href="#collection">
              Explore Our Diamonds <span>↗</span>
            </a>
            <a className="button-secondary" href="#contact">
              Talk to Our Team
            </a>
          </div>

          <div className="hero-note">
            <span className="status-dot" />
            Serving retail customers and diamond professionals
          </div>
        </div>

        <div className="hero-art" aria-label="Diamond-inspired artwork">
          <div className="art-glow" />
          <div className="diamond-frame">
            <svg
              viewBox="0 0 360 400"
              role="img"
              aria-label="Geometric illustration of a brilliant diamond"
            >
              <defs>
                <linearGradient id="diamondTop" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fff9e9" />
                  <stop offset="48%" stopColor="#c6b17d" />
                  <stop offset="100%" stopColor="#f7e9c1" />
                </linearGradient>
                <linearGradient id="diamondSide" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f6e7bf" />
                  <stop offset="50%" stopColor="#8c774b" />
                  <stop offset="100%" stopColor="#eee0b9" />
                </linearGradient>
              </defs>
              <g
                fill="none"
                stroke="#d8c18b"
                strokeWidth="1.1"
                strokeLinejoin="round"
              >
                <path
                  d="M95 93 L139 49 L221 49 L265 93 L180 335 Z"
                  fill="url(#diamondSide)"
                />
                <path d="M95 93 L139 49 L155 93 Z" fill="#fff8e8" />
                <path d="M139 49 L221 49 L205 93 L155 93 Z" fill="#dfcea4" />
                <path d="M221 49 L265 93 L205 93 Z" fill="#fff7df" />
                <path d="M95 93 L155 93 L180 335 Z" fill="#a99462" />
                <path d="M155 93 L205 93 L180 335 Z" fill="#fff4d5" />
                <path d="M205 93 L265 93 L180 335 Z" fill="#b5a071" />
                <path d="M95 93 L180 123 L265 93" />
                <path d="M155 93 L180 123 L205 93" />
                <path d="M180 123 L180 335" />
                <path d="M95 93 L205 93" stroke="#fff4d5" />
              </g>
              <g fill="#e7d5a5">
                <circle cx="79" cy="152" r="2" />
                <circle cx="278" cy="190" r="2" />
                <circle cx="108" cy="277" r="1.5" />
                <circle cx="252" cy="85" r="1.5" />
              </g>
            </svg>
          </div>
          <div className="art-caption">
            <span>THE ART OF BRILLIANCE</span>
            <span>01 — EXCELLENCE</span>
          </div>
        </div>

        <div className="hero-index">01 <span>/</span> 03</div>
      </section>

      <section className="trust-strip" id="about">
        <div>
          <span className="trust-number">01</span>
          <p><strong>Carefully Selected</strong><small>Quality-minded diamond sourcing</small></p>
        </div>
        <div>
          <span className="trust-number">02</span>
          <p><strong>Retail & Wholesale</strong><small>Solutions for every type of buyer</small></p>
        </div>
        <div>
          <span className="trust-number">03</span>
          <p><strong>Personal Service</strong><small>Real support from our sales team</small></p>
        </div>
      </section>

      <section className="collection" id="collection">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              FIND YOUR PERFECT STONE
            </div>
            <h2>Explore our <em>world</em> of diamonds.</h2>
          </div>
          <p>
            Looking for a specific diamond? Our team can help you
            find options suited to your needs.
          </p>
        </div>

        <div className="collection-card">
          <div className="collection-symbol">✧</div>
          <div>
            <h3>Looking for something specific?</h3>
            <p>
              Tell us what you need and our sales team will help
              you explore available diamonds.
            </p>
          </div>
          <a className="button-primary" href="#contact">
            Make an Inquiry <span>↗</span>
          </a>
        </div>
      </section>

      <footer className="footer" id="contact">
        <a className="brand" href="#home">
          <span className="brand-mark">H</span>
          <span>
            <strong>HEY MAN DIAMOND LLC</strong>
            <small>Harvesting Dreams, Together</small>
          </span>
        </a>
        <p>Exceptional diamonds. Personal service.</p>
        <a href="mailto:sales@heymandiamond.com">
          Contact our team ↗
        </a>
        <small>© {new Date().getFullYear()} Hey Man Diamond LLC</small>
      </footer>
    </main>
  )
}

export default App
