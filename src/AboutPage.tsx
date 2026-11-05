import './AboutPage.css'

export default function AboutPage() {
  return (
    <main className="about-page">
      <header className="about-header">
        <a className="about-brand" href="#home" aria-label="Return to Hey Man Diamond home">
          <img
            src="/heyman-diamond-logo.png"
            alt="Hey Man Diamond LLC"
            style={{ height: '48px', width: 'auto', objectFit: 'contain' }}
          />
        </a>
        <a className="about-back" href="#home">← Back to website</a>
      </header>

      <section className="about-hero">
        <span className="about-eyebrow">HEY MAN DIAMOND LLC · HARVESTING DREAMS, TOGETHER</span>
        <h1>About Our Diamond House</h1>
        <p className="about-hero-subtitle">
          Leading supplier of exceptional lab-grown diamonds, bringing ethical brilliance and master craftsmanship from the Diamond District of India to North America.
        </p>
      </section>

      <section className="about-container">
        <div className="about-narrative-card">
          <div className="about-section-header">
            <span className="about-gold-tag">GLOBAL SUPPLY &amp; HERITAGE</span>
            <h2>Who We Are</h2>
          </div>
          <p className="about-lead">
            One of the leading suppliers of grown diamonds, located in the Diamond District of India.
            Trusted by thousands of retailers, jewelry manufacturers, and repair shops across North America.
          </p>

          <hr className="about-divider" />

          <div className="about-section-header">
            <span className="about-gold-tag">OUR PHILOSOPHY</span>
            <h2>Impeccable Service &amp; In-Depth Expertise</h2>
          </div>
          <p>
            At HeyMan Diamond LLC, we strive to understand each customer’s specific requirements and give our best
            to provide impeccable customer service to all our clients. All our team members have in-depth
            knowledge of the product, as customer satisfaction is our top-most priority.
          </p>

          <hr className="about-divider" />

          <div className="about-section-header">
            <span className="about-gold-tag">OUR SPECIALIZATION</span>
            <h2>One-Stop Shop for Lab-Grown Diamonds</h2>
          </div>
          <p>
            We are a one stop shop for all your lab grown diamond requirements. Our comprehensive inventory includes:
          </p>

          <div className="about-inventory-grid">
            <div className="inventory-pill">
              <span className="pill-dot">✦</span>
              <strong>Round Melees &amp; Pointers</strong>
              <small>Calibrated sizes for micro-pave and precision settings</small>
            </div>
            <div className="inventory-pill">
              <span className="pill-dot">✦</span>
              <strong>Certified Inventory</strong>
              <small>Individually graded stones with IGI &amp; GIA reports</small>
            </div>
            <div className="inventory-pill">
              <span className="pill-dot">✦</span>
              <strong>Fancy Shape Layouts</strong>
              <small>Oval, Emerald, Radiant, Pear, Cushion &amp; custom suites</small>
            </div>
            <div className="inventory-pill">
              <span className="pill-dot">✦</span>
              <strong>Fancy Color Diamonds</strong>
              <small>Rare Pink, Vivid Yellow, Deep Blue, and Forest Green</small>
            </div>
          </div>

          <p className="about-services-note">
            <strong>Bespoke Trade Solutions:</strong> Along with wholesale, we provide dedicated service orders, stone matching, and custom bagging services tailored to retail and manufacturing workflows.
          </p>
        </div>

        {/* Global Presence & Offices */}
        <div className="about-offices-card">
          <div className="about-section-header">
            <span className="about-gold-tag">GLOBAL HUBS</span>
            <h2>Our Global Offices</h2>
          </div>
          <p className="about-offices-desc">
            With offices strategically positioned in New York, Chicago, and the Diamond District of Surat, Gujarat, our team ensures seamless logistics, rapid memo shipping, and direct diamond sourcing.
          </p>

          <div className="offices-grid">
            <div className="office-card">
              <div className="office-badge">United States</div>
              <h3>New York Office</h3>
              <p>23 W 47th St., #502<br />New York, NY 10063, USA</p>
              <div className="office-contact-links">
                <a href="tel:+13126460070">Phone: +1 312 646 0070</a>
                <a href="mailto:sales@heymandiamond.com">sales@heymandiamond.com</a>
              </div>
            </div>

            <div className="office-card">
              <div className="office-badge">United States</div>
              <h3>Chicago Office</h3>
              <p>5 S Wabash Ave, #1704<br />Chicago, IL 60603, USA</p>
              <div className="office-contact-links">
                <a href="tel:+13126460070">Phone: +1 312 646 0070</a>
                <a href="mailto:sales@heymandiamond.com">sales@heymandiamond.com</a>
              </div>
            </div>

            <div className="office-card office-card--accent">
              <div className="office-badge office-badge--india">India · Sourcing Hub</div>
              <h3>Diamond District Office</h3>
              <p>F 52 Princess Plaza, Sardar Chowk<br />Mini Bajar Varachha, Surat, Gujarat 395006, India</p>
              <div className="office-contact-links">
                <a href="tel:+919879612797">Phone: +91 98796-12797</a>
                <span>Surat Diamond Exchange Region</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="about-cta-bar">
          <div>
            <h3>Experience Hey Man Diamond</h3>
            <p>Access our certified lab-grown diamond inventory or connect with our sales team.</p>
          </div>
          <div className="about-cta-buttons">
            <a href="#collection" className="button-primary">Browse Collections</a>
            <a href="#signup-dealer" className="button-secondary">Apply for Wholesale Account</a>
          </div>
        </div>
      </section>

      <footer className="about-footer">
        <p>© {new Date().getFullYear()} HEY MAN DIAMOND LLC · ALL RIGHTS RESERVED.</p>
        <div className="about-footer-nav">
          <a href="#home">Home</a>
          <a href="#collection">Diamonds</a>
          <a href="#policy-shipping">Shipping Policy</a>
          <a href="#policy-privacy">Privacy Policy</a>
          <a href="#policy-terms">Terms of Service</a>
        </div>
      </footer>
    </main>
  )
}
