export default function CustomerExperience() {
  return (
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
          <a className="button-primary" href="#signup-dealer">Create Dealer Account</a>
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
          <a className="button-secondary" href="#signup-customer">Get Started</a>
        </article>
      </div>

      <p className="account-signin-link">Already have an account? <a href="#signin">Sign in here</a>.</p>
    </section>
  )
}
