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
        <p className="policy-draft-notice"><strong>Legal review required before launch:</strong> This is a draft, not legal advice. Confirm the company’s legal mailing address, applicable jurisdictions, actual website/data practices, return workflow, carrier contracts, and payment-provider rules. Do not publish until those facts are verified and counsel has reviewed the final wording.</p>

        {page === 'shipping' && <>
          <Section title="Shipping methods and insurance"><p>When available for the order, we intend to use an insured express carrier such as FedEx or UPS. The available service, insurance coverage, estimated delivery window, and shipping price will be confirmed before an order is accepted. Do not assume a service or delivery date until it is shown in your order confirmation.</p></Section>
          <Section title="Signature on delivery"><p>A signature will be required for diamond shipments. Please use a secure delivery address and ensure an authorized recipient is available. Carrier tracking and signature records may be used to help verify delivery.</p></Section>
          <Section title="Processing, delivery promises and delays"><p>Before an order is placed, we will display or communicate a reasonable shipping estimate for that order and retain the order confirmation. We will ship within the time stated in the offer or order confirmation. If no shipping time is stated, applicable U.S. mail, internet, or telephone order rules may require shipment within 30 days. If we cannot ship on time, we will provide the legally required delay notice and explain the customer’s options, including cancellation and a prompt refund where required. A carrier estimate is not a guarantee unless expressly stated.</p></Section>
          <Section title="Shipping charges"><p>Customers are responsible for the applicable shipping charges disclosed before they place an order. The invoice will show these separately as <strong>Shipping Charges</strong>. The final amount depends on the selected service, destination, package, and insurance requirements. We will not present an unconfirmed shipping amount as final.</p></Section>
          <Section title="International orders, customs and duties"><p>International shipping is available only when confirmed for the destination and order. Before accepting an international order, we will identify the shipping arrangement and disclose known customer-paid charges. Unless the order expressly states otherwise and applicable law permits it, the recipient is responsible for import duties, customs fees, brokerage charges, and destination taxes. These charges may be assessed by authorities or carriers and may not be included in the website price or Shipping Charges. Customs processing can delay delivery; customers should check their local import rules before ordering.</p></Section>
          <Section title="Address and delivery issues"><p>Please check the delivery address carefully before submitting an order. Contact us promptly if an address is incorrect or tracking indicates a problem. Changes may not be possible once a package is in transit. Report a missing, damaged, or apparently tampered-with package as soon as possible.</p></Section>
        </>}

        {page === 'returns' && <>
          <Section title="14-day money-back return window"><p>For eligible standard items, the proposed business policy is a money-back return window of 14 calendar days beginning on the date the shipment is delivered. Contact us within those 14 days to request written return authorization. The return instructions will state the deadline for dispatching the item and the address to use. Do not send a diamond back without authorization. This policy does not limit rights that cannot legally be waived, including any rights relating to an item that is defective, misdescribed, or not delivered as agreed.</p></Section>
          <Section title="Return eligibility and exclusions"><p>To qualify for a voluntary return, the diamond must be unworn and returned in the same condition as delivered, with all original tags, packaging, and the original GIA or IGI grading report/certificate included when supplied. We may inspect the item and verify its identifying characteristics before approving a refund. Altered, mounted, engraved, damaged, substituted, or custom/special-order items may be excluded from the voluntary return program only where that exclusion is disclosed before purchase and permitted by law. These conditions do not remove any non-waivable statutory rights or remedies.</p></Section>
          <Section title="Return shipping"><p>Follow the return instructions we provide and use secure, trackable shipping with insurance appropriate for the item’s value. If FedEx is used for the return, the customer is responsible for the applicable return shipping charge, which will be disclosed before the shipment is arranged. Do not send a valuable diamond in an ordinary untracked envelope.</p></Section>
          <Section title="Inspection, refund amount and timing"><p>After receipt, we will inspect the returned item and confirm whether it meets the disclosed return conditions. For an approved money-back return, the refund will cover the amount legally refundable under the order terms and applicable law. Any deduction must have a lawful basis and must have been clearly disclosed before purchase; we will not impose an undisclosed restocking charge. We will communicate the refund method and expected timing when authorizing the return and process it within applicable legal and payment-provider deadlines. Your bank or payment provider may take additional time to post the credit.</p></Section>
          <Section title="Restocking fees and return shipping"><p>No restocking fee is currently specified in this draft, and none should be charged unless the exact amount or calculation and the circumstances are disclosed before purchase and approved for legal compliance. Customers are responsible for return shipping where permitted and as disclosed before the return is arranged. If FedEx is used, the applicable return-shipping charge must be disclosed before the customer commits to the label or shipment. We will provide secure shipping instructions appropriate for the item’s value.</p></Section>
          <Section title="Start a return"><p>Email <a href="mailto:sales@heymandiamond.com?subject=Return%20Request">sales@heymandiamond.com</a> with your order number and a description of the request. Do not include full payment-card or bank-account details in email.</p></Section>
        </>}

        {page === 'privacy' && <>
          <Section title="Information we may collect"><p>Depending on the features you use, the website may collect contact details, account credentials and profile information, order and quote details, dealer application information, customer support messages, review submissions, and technical data such as browser/device information and site usage. Only information needed for a stated business purpose should be requested.</p></Section>
          <Section title="How information is used"><p>Information may be used to create and secure accounts, respond to inquiries, process quotes and orders, verify payments, arrange delivery and returns, review dealer applications, provide customer support, prevent fraud, maintain records, and meet legal obligations. Marketing messages should be sent only where permitted, with an appropriate way to opt out.</p></Section>
          <Section title="Service providers and sharing"><p>Information may be shared with service providers only as needed for functions actually used by the website, such as hosting, authentication, email delivery, payment processing, inventory, fraud prevention, and shipping. The final notice must identify relevant providers and accurately describe sharing practices after the integrations are selected. We do not promise that data is never shared with service providers.</p></Section>
          <Section title="Cookies, analytics and advertising"><p>The final policy must identify the cookies and similar technologies actually deployed, their purposes, and any third parties that receive data. Do not state that analytics, advertising pixels, or non-essential cookies are used or disabled until the live site has been audited. Where required by law, obtain consent before using non-essential cookies or similar technologies and provide a working way to change or withdraw consent. Any legally required opt-out mechanisms, including recognized browser opt-out signals where applicable, must be implemented and tested before making related promises.</p></Section>
          <Section title="Retention and security"><p>Information should be retained only as long as reasonably needed for the purposes described, including order, accounting, security, and legal recordkeeping. Access to sensitive dealer or payment-related information should be restricted. No website can guarantee absolute security; suspected incidents should be handled through an established response process.</p></Section>
          <Section title="Privacy rights and requests"><p>Depending on where you live, the nature of our business, and applicable thresholds, you may have rights to access, know, correct, delete, obtain a copy of, or object to certain uses or disclosures of personal information, and to opt out of certain sales, sharing, or targeted advertising. These rights are not identical in every jurisdiction and may have legal exceptions. Contact <a href="mailto:sales@heymandiamond.com?subject=Privacy%20Request">sales@heymandiamond.com</a> to submit a request. We may need to verify your identity and will respond within the deadline required by applicable law. If a law requires a separate notice at collection, “Do Not Sell or Share” link, or other notice/control, it must be provided in the appropriate place before launch if applicable.</p></Section>
          <Section title="International transfers and children"><p>If information is transferred internationally, the final policy should explain the relevant safeguards where required. The site is not intended to invite children to submit personal information. These statements must be reviewed against actual operations and applicable law before publication.</p></Section>
          <Section title="Before this policy is finalized"><p>The business must confirm its hosting, authentication, analytics, email, payment, inventory, and shipping providers; cookie behavior; retention schedule; and privacy-request process. This draft does not by itself establish GDPR or CCPA/CPRA compliance.</p></Section>
        </>}

        {page === 'terms' && <>
          <Section title="Product information and diamond disclosures"><p>Product descriptions, images, measurements, grading reports, treatment disclosures, availability, and delivery estimates must be accurate and tied to the specific item offered. A grading claim must identify the grading system or laboratory where required, and any diamond treatment, lab-grown status, size/weight qualification, or material limitation must be disclosed clearly and near the relevant claim. A photograph or illustration must not misleadingly exaggerate a stone’s actual size. A product appearing on the website does not guarantee current stock, and a grading report should be checked against the actual stone.</p></Section>
          <Section title="Prices, quotes and errors"><p>Website prices and promotions are subject to confirmation and applicable terms. If a price, discount, product detail, or availability is materially incorrect, we may contact you before accepting the order or cancel and refund an order as permitted by law. A “Quote your price” request is a negotiation request only; it is not an accepted sale price or a binding order until we expressly confirm it.</p></Section>
          <Section title="Order acceptance and payment"><p>An order request is not accepted until we send an order confirmation or otherwise clearly confirm acceptance. We may need to verify identity, payment, product details, and availability. Orders paid by bank transfer or Zelle remain pending until funds are independently confirmed. Never rely on a payment screenshot alone as proof of receipt.</p></Section>
          <Section title="Fees and invoice"><p>The invoice will itemize applicable charges. Customer-paid delivery costs will be listed as <strong>Shipping Charges</strong>. A payment-related fee, if any, will be listed as <strong>Transaction Fee</strong> only when it is permitted by applicable law, card-network rules, and provider terms and disclosed before payment confirmation. Not every payment method incurs such a fee.</p></Section>
          <Section title="Returns, shipping and risk"><p>Shipping and returns are governed by the separate Shipping & Delivery and Returns & Refunds policies shown on this website. Those policies must be reviewed before placing an order. Nothing in these terms limits rights that cannot legally be excluded.</p></Section>
          <Section title="Acceptable use and intellectual property"><p>Do not misuse the website, attempt unauthorized access, interfere with its operation, or submit information you do not have the right to provide. Website text, branding, design, and imagery may be protected by intellectual-property laws. Do not reuse them without permission unless the law allows it.</p></Section>
          <Section title="Changes, legal notices and contact"><p>We may update website information and these terms prospectively. The version applicable to an order should be available before the customer submits the order, and material changes should not be applied retroactively where prohibited by law. Before launch, add and verify the company’s legal mailing address and any legally required business/contact disclosures; email alone may not satisfy every applicable notice requirement. Questions can be sent to <a href="mailto:sales@heymandiamond.com">sales@heymandiamond.com</a>. Counsel should review governing law, dispute-resolution terms, warranties, liability limitations, and any other clauses before publication.</p></Section>
        </>}

        {page === 'faq' && <>
          <Section title="Are your diamonds natural or lab-grown?"><p>The current website focuses on lab-grown diamonds. Review the product description and accompanying grading documentation for the details of a specific stone.</p></Section>
          <Section title="What do GIA and IGI certificates mean?"><p>These are diamond grading laboratories. A grading report describes the stone submitted for grading; it is not a guarantee of value or investment performance. Review the report number and specifications and confirm that the report matches the actual stone. Certificate availability varies by product, and product claims must match the documentation supplied.</p></Section>
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
          <Section title="Printable chart"><p>A downloadable chart should be added only after all measurements and international-size conversions have been checked against a reliable sizing reference. If you use a verified chart, print at “Actual size” or 100% scale, disable “Fit to page,” and check its calibration marker with a ruler. This page does not currently include a calibrated printable chart, so professional measurement is recommended.</p></Section>
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
