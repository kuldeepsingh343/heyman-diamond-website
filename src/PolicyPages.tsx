import type { ReactNode } from 'react'
import './PolicyPages.css'

type PolicySlug = 'shipping' | 'returns' | 'privacy' | 'terms' | 'faq' | 'sizing'

const pageTitles: Record<PolicySlug, string> = {
  shipping: 'Shipping & Delivery Policy',
  returns: 'Returns & Refunds Policy',
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  faq: 'Frequently Asked Questions',
  sizing: 'Ring Sizing Guide',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="policy-section"><h2>{title}</h2>{children}</section>
}

function PolicyPages({ slug }: { slug: string }) {
  const page = (Object.keys(pageTitles) as PolicySlug[]).includes(slug as PolicySlug)
    ? slug as PolicySlug
    : 'faq'

  return (
    <main className="policy-page">
      <header className="policy-header">
        <a className="policy-brand" href="#home" aria-label="Return to Hey Man Diamond home">
          <span className="policy-mark">H</span>
          <span><strong>HEY MAN DIAMOND LLC</strong><small>Harvesting Dreams, Together</small></span>
        </a>
        <a className="policy-back" href="#home">← Back to website</a>
      </header>
      <div className="policy-hero">
        <span className="policy-eyebrow">HEY MAN DIAMOND LLC · CUSTOMER INFORMATION</span>
        <h1>{pageTitles[page]}</h1>
        <p>Clear information to help you shop with confidence.</p>
      </div>
      <div className="policy-content">
        <p className="policy-draft-notice"><strong>Before launch:</strong> This page is a working draft. Business-specific details and legal requirements must be verified before it is treated as the final policy.</p>

        {page === 'shipping' && <>
          <Section title="Shipping methods and insurance"><p>When available for the order, we intend to use an insured express carrier such as FedEx or UPS. The available service, insurance coverage, estimated delivery window, and shipping price will be confirmed before an order is accepted. Do not assume a service or delivery date until it is shown in your order confirmation.</p></Section>
          <Section title="Signature on delivery"><p>A signature will be required for diamond shipments. Please use a secure delivery address and ensure an authorized recipient is available. Carrier tracking and signature records may be used to help verify delivery.</p></Section>
          <Section title="Processing and delivery estimates"><p>Processing time depends on product availability, payment verification, and any required quality checks. The estimated processing and transit times for your specific order should be provided before payment confirmation. Carrier delays, weather, security checks, and other events outside our control may affect delivery.</p></Section>
          <Section title="Shipping charges"><p>Customers are responsible for the applicable shipping charges disclosed before they place an order. The invoice will show these separately as <strong>Shipping Charges</strong>. The final amount depends on the selected service, destination, package, and insurance requirements. We will not present an unconfirmed shipping amount as final.</p></Section>
          <Section title="International orders, customs and duties"><p>International shipping is subject to destination, carrier availability, and business approval. Unless the order expressly states otherwise, customers are responsible for applicable import duties, customs fees, brokerage charges, and destination taxes. Customs processing can delay delivery. We will clarify the shipping arrangement and known charges before accepting an international order.</p></Section>
          <Section title="Address and delivery issues"><p>Please check the delivery address carefully before submitting an order. Contact us promptly if an address is incorrect or tracking indicates a problem. Changes may not be possible once a package is in transit. Report a missing, damaged, or apparently tampered-with package as soon as possible.</p></Section>
        </>}

        {page === 'returns' && <>
          <Section title="14-day return request window"><p>Our intended policy is a 14-day money-back return window. The final policy must specify the exact event that starts the 14 days and the approved return-request process before launch. Contact our team within the applicable window to request return authorization; do not send a diamond back without instructions.</p></Section>
          <Section title="Return eligibility"><p>To qualify, the diamond must be unworn and returned in its original condition, with all original tags and packaging intact and the original GIA or IGI certificate included when one was supplied. Items that are altered, damaged, substituted, or returned without required documentation may not qualify, subject to applicable law and the final approved policy. Custom, engraved, or special-order items may require separate terms disclosed before purchase.</p></Section>
          <Section title="Return shipping"><p>Follow the return instructions we provide and use secure, trackable shipping with insurance appropriate for the item’s value. If FedEx is used for the return, the customer is responsible for the applicable return shipping charge, which will be disclosed before the shipment is arranged. Do not send a valuable diamond in an ordinary untracked envelope.</p></Section>
          <Section title="Inspection and refunds"><p>After the returned item and its certificate are received, we will inspect the item and confirm eligibility. The refund method and expected processing time will be communicated with the return authorization and must comply with applicable law and payment-provider requirements. A refund may take additional time to appear depending on the bank or payment provider.</p></Section>
          <Section title="Restocking fees and exceptions"><p>No restocking fee amount is stated here. If the business decides to charge a restocking fee, the amount, calculation, and circumstances must be disclosed before purchase and reviewed for legal compliance. Any exception or deduction will be handled according to the final published policy and applicable law.</p></Section>
          <Section title="Start a return"><p>Email <a href="mailto:sales@heymandiamond.com?subject=Return%20Request">sales@heymandiamond.com</a> with your order number and a description of the request. Do not include full payment-card or bank-account details in email.</p></Section>
        </>}

        {page === 'privacy' && <>
          <Section title="Information we may collect"><p>Depending on the features you use, the website may collect contact details, account credentials and profile information, order and quote details, dealer application information, customer support messages, review submissions, and technical data such as browser/device information and site usage. Only information needed for a stated business purpose should be requested.</p></Section>
          <Section title="How information is used"><p>Information may be used to create and secure accounts, respond to inquiries, process quotes and orders, verify payments, arrange delivery and returns, review dealer applications, provide customer support, prevent fraud, maintain records, and meet legal obligations. Marketing messages should be sent only where permitted, with an appropriate way to opt out.</p></Section>
          <Section title="Service providers and sharing"><p>Information may be shared with service providers only as needed for functions actually used by the website, such as hosting, authentication, email delivery, payment processing, inventory, fraud prevention, and shipping. The final notice must identify relevant providers and accurately describe sharing practices after the integrations are selected. We do not promise that data is never shared with service providers.</p></Section>
          <Section title="Cookies and analytics"><p>Cookies or similar technologies may be used for essential site functions and, if enabled, analytics or marketing. The final policy must list the technologies actually in use and explain available choices. Do not claim that a cookie banner, opt-out signal, or preference center exists unless it has been implemented and tested.</p></Section>
          <Section title="Retention and security"><p>Information should be retained only as long as reasonably needed for the purposes described, including order, accounting, security, and legal recordkeeping. Access to sensitive dealer or payment-related information should be restricted. No website can guarantee absolute security; suspected incidents should be handled through an established response process.</p></Section>
          <Section title="Privacy rights and requests"><p>Depending on your location and the circumstances, you may have rights to request access, correction, deletion, portability, or to object to or limit certain processing. GDPR and California privacy-law obligations apply only where their legal requirements are met. Contact <a href="mailto:sales@heymandiamond.com?subject=Privacy%20Request">sales@heymandiamond.com</a> to ask a question or submit a request. The business must verify identity and respond within any applicable legal deadline.</p></Section>
          <Section title="International transfers and children"><p>If information is transferred internationally, the final policy should explain the relevant safeguards where required. The site is not intended to invite children to submit personal information. These statements must be reviewed against actual operations and applicable law before publication.</p></Section>
          <Section title="Before this policy is finalized"><p>The business must confirm its hosting, authentication, analytics, email, payment, inventory, and shipping providers; cookie behavior; retention schedule; and privacy-request process. This draft does not by itself establish GDPR or CCPA/CPRA compliance.</p></Section>
        </>}

        {page === 'terms' && <>
          <Section title="Website information and availability"><p>Product descriptions, photographs, specifications, certificates, availability, and delivery estimates are provided for customer information and may need confirmation before an order is accepted. We will correct material errors when identified. A product appearing on the website does not guarantee current stock.</p></Section>
          <Section title="Prices, quotes and errors"><p>Website prices and promotions are subject to confirmation and applicable terms. If a price, discount, product detail, or availability is materially incorrect, we may contact you before accepting the order or cancel and refund an order as permitted by law. A “Quote your price” request is a negotiation request only; it is not an accepted sale price or a binding order until we expressly confirm it.</p></Section>
          <Section title="Order acceptance and payment"><p>An order request is not accepted until we send an order confirmation or otherwise clearly confirm acceptance. We may need to verify identity, payment, product details, and availability. Orders paid by bank transfer or Zelle remain pending until funds are independently confirmed. Never rely on a payment screenshot alone as proof of receipt.</p></Section>
          <Section title="Fees and invoice"><p>The invoice will itemize applicable charges. Customer-paid delivery costs will be listed as <strong>Shipping Charges</strong>. A payment-related fee, if any, will be listed as <strong>Transaction Fee</strong> only when it is permitted by applicable law, card-network rules, and provider terms and disclosed before payment confirmation. Not every payment method incurs such a fee.</p></Section>
          <Section title="Returns, shipping and risk"><p>Shipping and returns are governed by the separate Shipping & Delivery and Returns & Refunds policies shown on this website. Those policies must be reviewed before placing an order. Nothing in these terms limits rights that cannot legally be excluded.</p></Section>
          <Section title="Acceptable use and intellectual property"><p>Do not misuse the website, attempt unauthorized access, interfere with its operation, or submit information you do not have the right to provide. Website text, branding, design, and imagery may be protected by intellectual-property laws. Do not reuse them without permission unless the law allows it.</p></Section>
          <Section title="Changes and contact"><p>We may update website information and these terms from time to time. The version applicable to an order should be available to the customer when the order is placed. Questions can be sent to <a href="mailto:sales@heymandiamond.com">sales@heymandiamond.com</a>. Business counsel should review these terms and identify governing-law and dispute provisions before launch.</p></Section>
        </>}

        {page === 'faq' && <>
          <Section title="Are your diamonds natural or lab-grown?"><p>The current website focuses on lab-grown diamonds. Review the product description and accompanying grading documentation for the details of a specific stone.</p></Section>
          <Section title="What do GIA and IGI certificates mean?"><p>These are diamond grading laboratories. If a diamond is represented as certified, review the certificate details and ensure the report corresponds to the stone being purchased. Certificate availability varies by product.</p></Section>
          <Section title="Can I buy as a diamond dealer?"><p>Wholesale access is intended for eligible diamond professionals and may require an application and approval. Wholesale pricing should be visible only to appropriately approved accounts.</p></Section>
          <Section title="Can I request a different price?"><p>Where available, you may submit a quote request. A quote request is not an accepted price; our team must review and confirm any offer.</p></Section>
          <Section title="Which payment methods can I use?"><p>Available methods will be displayed at checkout. Bank transfer and Zelle payments may remain pending until the business verifies receipt. Card and supported digital-wallet options depend on payment-provider setup.</p></Section>
          <Section title="What is a Transaction Fee?"><p>If a permitted payment-related fee applies, it will be shown as “Transaction Fee” before you confirm payment and itemized on your invoice. A fee will not be added for a method where it does not apply or cannot legally be passed on.</p></Section>
          <Section title="How are shipping charges shown?"><p>Applicable delivery costs paid by the customer are disclosed before checkout and shown on the invoice as “Shipping Charges.” Diamond deliveries require a signature.</p></Section>
          <Section title="How do returns work?"><p>The intended return policy is a 14-day money-back window, subject to the final published terms, return authorization, and eligibility requirements. Keep the original tags, packaging, and supplied grading certificate.</p></Section>
          <Section title="How can I contact the team?"><p>Email <a href="mailto:sales@heymandiamond.com">sales@heymandiamond.com</a> or call +1 312 646 0070. Do not send full bank or payment-card details in ordinary email.</p></Section>
        </>}

        {page === 'sizing' && <>
          <Section title="Measure an existing ring"><ol><li>Choose a ring that fits the intended finger comfortably.</li><li>Place it on a ruler and measure the inside diameter straight across the center, from inner edge to inner edge.</li><li>Measure in millimeters and compare the result with a verified sizing chart from a jeweler.</li></ol></Section>
          <Section title="Measure your finger"><ol><li>For a reliable result, ask a jeweler to measure the finger with a ring sizer.</li><li>Your fingers may change size with temperature and time of day. Measure when your hands are at a comfortable temperature.</li><li>The ring should pass over the knuckle with gentle resistance and sit comfortably without feeling tight.</li></ol></Section>
          <Section title="Sizing tips"><ul><li>Ring sizes can vary by country and by ring design; confirm the sizing system used by the seller.</li><li>Wider bands may feel tighter than narrow bands.</li><li>For valuable, custom, or engagement-ring orders, confirm the size with a professional before ordering.</li><li>Do not rely on a screen image or an unverified printout to determine size.</li></ul></Section>
          <Section title="Printable chart"><p>A downloadable chart should be added only after its measurements and conversions have been checked against a reliable sizing reference. If you print a chart, use “Actual size” or 100% scale and disable “Fit to page”; verify its calibration marker with a ruler before use. This page does not currently include a calibrated printable chart, so professional measurement is recommended.</p></Section>
        </>}

        <nav className="policy-related" aria-label="Other policy pages">
          <strong>More customer information</strong>
          {(Object.keys(pageTitles) as PolicySlug[]).filter((item) => item !== page).map((item) => (
            <a key={item} href={`#policy-${item}`}>{pageTitles[item]} ↗</a>
          ))}
        </nav>
        <p className="policy-contact">Questions? Contact <a href="mailto:sales@heymandiamond.com">sales@heymandiamond.com</a>.</p>
      </div>
      <footer className="policy-footer">© {new Date().getFullYear()} Hey Man Diamond LLC · Working draft — verify business details and obtain legal review before launch.</footer>
    </main>
  )
}

export default PolicyPages
