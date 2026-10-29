# Hey Man Diamond LLC — delivery plan

## Product goals
- Responsive luxury website for retail customers and diamond professionals.
- Flomiz-backed diamond catalog with search, filters, fresh stock and safe product fields only; customer identity and records live in the website's own account/database system.
- Customer/dealer signup; new dealer KYC review; existing-dealer verification.
- Protected Admin Portal for dealer applications, orders, reviews, promotions and integration settings.
- Reviews publish immediately, with fair abuse moderation, company replies, email notices and account notifications after email ownership is verified.
- Promotions with schedule, coupon codes, eligibility rules and server-side discount validation.
- Inquiry/quote workflow first; checkout/payment only after payment provider and inventory reservation behavior are confirmed.
- API-first architecture for future Android/iOS apps.

## Current implementation boundary
The existing Vite/React site is a frontend. A form or dashboard mockup is not a working account system. Real customer use requires trusted server APIs, authentication, database policies, email delivery, deployment and monitoring. Do not submit real tax IDs or banking information to the current prototype.

## Delivery phases
1. Foundation/security: select hosted backend, configure auth, roles, RLS, environment secrets and CI.
2. Accounts/dealer approval: signup/login/password reset/email verification, KYC, existing-customer verification, admin review, status emails and audit log.
3. Flomiz catalog: test authorized credentials, paginate, normalize fields, cache responsibly, return only approved fields.
4. Admin Portal: protected dashboard, dealer queue, review/reply queue, order/inquiry management, promotion editor, integration health/settings.
5. Reviews/notifications: validated submission, spam protection, replies, verified email linkage, unread state and retryable email.
6. Offers/orders: server-side promotion rules; recheck stock/prices at order time; avoid overselling if no inventory reservation/write-back exists.
7. Launch hardening: tests, accessibility/mobile QA, backups, privacy/terms/retention review, monitoring, domain/SSL, deployment and rollback.

## Required external access/decisions
- Backend project and production secrets.
- Flomiz CustomerId/auth method, allowed PortalType, rate limits, image behavior and confirmation of reservation/write-back/webhook support.
- Transactional email provider and verified sender/domain.
- Hosting provider/domain.
- Payment provider and tax/shipping/return policy if online checkout is required.
- Business/legal review of KYC, signature consent, data retention, privacy notice, terms and review moderation.

## Security invariants
- Flomiz is a product/inventory data source only. Never use it as a source of customer names, emails, accounts, orders or other customer records.
- Customers must authenticate with the website account system before saving a quote or placing an order; derive customer identity from the verified session, not request-body email fields.
- Keep website customer profiles, orders and quote requests in our own database, linked to the website auth user ID.
- Never put Flomiz credentials, database service-role keys, payment secrets or email API keys in browser code or VITE_ variables.
- Never trust client-supplied role, price, discount, stock or order total.
- Enforce dealer permissions server-side.
- Never link anonymous review emails to accounts without email verification.
- Restrict KYC to authorized reviewers; audit status changes.
- Revalidate stock and prices before accepting orders; make checkout idempotent.
- Enable RLS and test unauthorized access.
- Keep bank account details out of public source code and browser bundles; payment instructions must be managed through authenticated, authorized Admin Portal settings and delivered only when needed for checkout.
- For manual bank transfer and Zelle payments, create orders as pending payment. Only an authorized admin may mark funds received after independently confirming receipt in the bank account; screenshots or customer claims alone are not proof.
- Offer direct bank transfer and Zelle as the preferred direct-payment methods, with Stripe card payment as an optional alternative. Confirm business-account eligibility, limits, fees, and payment policies with the bank/provider before launch.
- Any Stripe/card surcharge must remain disabled until eligibility, applicable laws, card-network rules, required disclosures, and actual account pricing have been verified. Calculate any permitted fee server-side and show the full amount before payment confirmation. Never hard-code a flat fee.

## Local validation
Run in the project folder:
    npm.cmd install
    npm.cmd run lint
    npm.cmd run build

A green build verifies frontend compilation only; it does not verify integrations or production readiness.

## Customer cart and quote negotiation
- Customers can add multiple diamonds to a cart and choose either checkout at the currently displayed price or **Quote your price**.
- Quote mode keeps the full selected cart and asks for one requested unit price per diamond; customers can review and save the request only after signing in.
- Quote submission derives the customer's ID and email from the authenticated website session and stores the request in our own database; it does not retrieve customer information from Flomiz.
- Actual order placement/checkout must also require sign-in and use the authenticated account identity. Guest browsing can remain available.
- Saving creates one quote request plus item-level rows containing SKU, product snapshot, quantity, current displayed price when available, and the customer's requested price for each item.
- New quote requests appear in the authenticated Admin Portal inbox and are counted as new until an administrator updates their status. Admin APIs: `GET /api/admin/quotes` and `PATCH /api/admin/quotes/:id`.
- This API/data foundation is not a completed checkout or a finished customer-facing cart UI. The current catalog intentionally omits prices until the business-approved price source and retail/dealer permissions are implemented.
- Before payment launch, the server must independently fetch/verify current stock and the customer's authorized price, calculate totals server-side, and create an order only after the customer confirms. Never treat a customer-entered quote price as an accepted sale price.
- The Admin Portal can receive immediate in-app updates by refreshing/polling the quotes inbox; a live push/badge UI and email alerts require the portal UI and notification delivery to be implemented/configured.

## Customer-facing policy and help pages
- Add footer links and dedicated responsive pages for Shipping & Delivery, Returns & Refunds, Privacy Policy, Terms of Service, FAQ, and Ring Sizing Guide.
- Shipping & Delivery must explain insured shipping options (such as FedEx/UPS when available), signature requirements, order processing and estimated delivery, international availability, customs/duties/taxes, and who pays each charge. Show applicable customer-paid shipping costs as a separate invoice line named **Shipping Charges** before checkout confirmation.
- Returns & Refunds should describe the proposed 14-day money-back return window, when the window begins, how customers request authorization, secure return shipping, inspection and refund timing, and eligibility requirements such as unworn condition, intact tags, and original GIA/IGI certificates where applicable. If the customer elects or is required to use FedEx for a return, disclose the applicable return-shipping charge before the label/shipment is arranged. Any restocking fee must be clearly disclosed before purchase and reviewed for legal compliance; do not apply undisclosed fees.
- Privacy Policy must describe actual practices, not claim blanket GDPR/CCPA compliance. Before publishing, verify what data the site and each connected provider actually collect, why it is used, lawful basis where applicable, sharing/recipients, retention, cookies/analytics, security practices, international transfers, and how people can exercise applicable rights. Only describe cookie consent controls, opt-outs, deletion processes, and security measures that are actually implemented.
- Terms of Service must accurately explain site use, product availability, quote requests versus accepted orders, price/display errors, order acceptance/cancellation, payment and transaction-fee disclosures, shipping, returns, and applicable limitations. Obtain legal review before launch.
- FAQ should answer common questions about diamond grading certificates, natural/lab-grown diamonds, retail/dealer access, quotes, accepted payments, any permitted Transaction Fee, Shipping Charges, delivery signatures, returns, and order tracking.
- Ring Sizing Guide should provide clear measurement instructions and a printable size chart with print-scale guidance; explain sizing-system conversions and recommend professional confirmation for valuable/custom orders. Verify the chart before publishing.
- Make policies readable on mobile and accessible from the footer and relevant checkout steps. Link the applicable policies near personal-data collection forms and checkout before the customer submits information or places an order.
- Treat all policy copy as a draft until business facts are verified and counsel reviews it for the jurisdictions and sales channels that apply. Do not invent processing times, shipping rates, refund deadlines beyond the approved policy, restocking-fee amounts, cookie behavior, or privacy practices.
- Invoice requirements: display applicable customer-paid shipping as **Shipping Charges** and any legally/provider-permitted payment-related fee as **Transaction Fee**. Calculate charges on the server, disclose the final amount before confirmation, and retain matching itemized order/invoice records. Do not add a fee where none applies or where passing it to the customer is prohibited.

