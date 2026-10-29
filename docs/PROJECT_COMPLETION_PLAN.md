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

## Legal and consumer-disclosure review before launch
This checklist is a practical implementation aid, not a legal opinion. Have qualified U.S. counsel review the final policies and actual checkout/data flows for every state and country served.

- **Business identity:** Verify the registered legal name, customer-service email, phone number, and required physical/mailing address. Add an effective/last-updated date only after the policy is approved.
- **Shipping and delayed orders:** Show the promised shipment/delivery estimate before purchase and retain the confirmation. If an order cannot ship within the promised time, send the notice and offer cancellation/refund options required by the FTC Mail, Internet, or Telephone Order Merchandise Rule. If no shipping time is stated, the rule generally requires shipment within 30 days; do not use vague estimates to evade this requirement.
- **Price and checkout disclosures:** Show item price, shipping, taxes where calculable, and any permitted Transaction Fee before the customer commits. Confirm sales-tax collection/registration obligations with a tax professional for the jurisdictions served. Avoid hidden fees and ensure the order total matches the invoice.
- **Returns and refunds:** Confirm that the 14-calendar-day window starts at delivery; publish the authorization method, return dispatch deadline, condition/documentation rules, treatment of custom/special-order items, who pays return shipping, any restocking fee (preferably none unless specifically approved), inspection process, and refund timing. Disclose all conditions before purchase. Do not restrict non-waivable rights for defective, misdescribed, or undelivered goods.
- **Diamond/jewelry advertising:** Verify every claim about natural versus laboratory-grown origin, grading laboratory, report/certificate, carat weight, dimensions, treatments, color, clarity, cut, metal content, and origin. Ensure images do not misleadingly exaggerate actual stone size. Use the FTC Jewelry Guides (16 CFR Part 23) as a review reference.
- **Privacy/data collection:** Inventory actual data flows and providers, including hosting, auth, analytics, cookies, email, payments, Flomiz, shipping, fraud prevention, and dealer KYC. State purposes, categories, recipients, retention, security practices, international transfers, and how to exercise applicable rights accurately. Determine whether GDPR, CCPA/CPRA, other state privacy laws, cookie consent, notice-at-collection, or opt-out links apply based on actual facts and current law. Do not claim controls or compliance that are not implemented.
- **Dealer/KYC information:** Minimize collection of tax IDs, bank details, ownership/director data, and signatures. Define access controls, secure transfer/storage, retention/deletion, audit logs, incident response, and whether any additional financial/AML duties apply. Do not collect sensitive information in the current prototype.
- **Payments and surcharges:** Confirm provider/account eligibility, card-network rules, state/local law, disclosure timing, and actual provider costs before enabling any surcharge. Keep it disabled until reviewed. Never apply a fee to debit/prepaid or wallet transactions unless the provider and applicable rules explicitly permit it. The invoice label, where lawful, is **Transaction Fee**.
- **Policies in context:** Link privacy information at or before data collection, and show shipping, return, tax, payment, and cancellation terms before the order is submitted. Keep an accessible copy of the exact policy version shown for each order.
- **Ring sizing:** Do not publish a printable chart until the source measurements, international conversions, and print calibration have been independently checked.
- **References for counsel/implementation:** [FTC online shopping and shipping/return guidance](https://consumer.ftc.gov/articles/online-shopping); [FTC Jewelry Guides, 16 CFR Part 23](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-23); [California Attorney General CCPA overview](https://oag.ca.gov/privacy/ccpa); [California Privacy Protection Agency laws and regulations](https://privacy.ca.gov/laws-and-regulations/).


## Phase 1 execution status — updated 2026-10-29

**Status: repository groundwork documented; hosted-backend setup remains blocked. Do not mark Phase 1 fully complete yet.**

### Completed in the repository
- React/Vite/TypeScript project and Node API entry point exist.
- CI workflow is configured to run `npm ci`, lint, frontend build, and Node syntax validation on pushes and pull requests.
- API configuration is read from server environment variables; privileged database credentials are intended to remain server-side.
- API health endpoint reports only whether configuration values are present, not credential values.
- Existing API scaffolding includes session-token validation against Supabase Auth and database-backed admin permission lookup.

### Blocking items discovered
- The Supabase organization exists, but no Supabase projects are currently listed. Project creation was not completed. No database, Auth configuration, RLS policies, or project credentials have therefore been verified.
- No successful CI workflow run was found for the latest branch commits; local lint/build and API checks remain unverified.
- The API code still needs a security pass before production: fix/verify inquiry email validation and dealer-application route matching; enforce explicit review permissions on admin review listing/status/reply actions; add durable rate limiting and origin validation; and validate quote SKUs/prices against the website-owned catalog rather than trusting client snapshots/prices.
- Do not collect real dealer KYC data until secure database policies, access controls, retention, and audit logging have been deployed and tested.
- Hosting, production secrets, authorized Flomiz credentials, and transactional email remain unconfigured.

### Phase 1 exit criteria
- [ ] Create/confirm the Supabase project and region; confirm any quoted recurring cost before creation.
- [ ] Apply reviewed schema/migrations and enable RLS on every exposed table with least-privilege policies.
- [ ] Configure email confirmation, password reset, redirect URLs, and verified sender/SMTP before enabling account signup.
- [ ] Keep privileged credentials in server-only secret storage; never commit them or expose them through `VITE_*` variables.
- [ ] Fix and test the API validation/authorization findings above.
- [ ] Add automated tests for unauthenticated, ordinary-customer, dealer, and authorized-admin access; test cross-account data isolation.
- [ ] Run CI successfully and record the passing commit/run.
- [ ] Verify deployment health and database connectivity without logging secrets.

**Decision:** Phase 1 is *in progress*, not production-ready. Continue to Phase 2 only after the exit criteria relevant to authentication, database security, and CI are met. The current frontend/API scaffold is not a live account system.


### Supabase project confirmation — 2026-10-29
- The Supabase project `heyman-diamond-website` is present and reports `ACTIVE_HEALTHY` in region `us-east-1`; project ref: `qdjqdbuozbgghasmeksw`.
- Initial inspection found zero tables in the `public` schema and zero recorded migrations. Database schema, authentication flows, and row-level security policies are not yet configured/verified.
- Supabase security advisor returned no lint findings at this initial empty-database stage; this is not proof of application security.
- A publishable key exists. Configure credentials through local/server environment settings; never commit secret/service-role keys or share them in chat. Prefer the current publishable/secret key types where supported.
- Phase 1 remains in progress until schema and least-privilege RLS policies are applied, Auth settings are configured, API issues are fixed, and CI/tests pass.


## Supabase foundation status — 2026-10-29

- Connected Supabase project `heyman-diamond-website` in `us-east-1`; project reference is recorded in deployment configuration, not as a secret.
- Applied database migration `20261029203058_initial_website_schema_rls`: profiles, admin permissions, dealer applications, orders/inquiries, quote requests and items, reviews and replies, audit log, and promotions.
- Enabled Row Level Security (RLS) on all ten public tables. No browser-facing table policies are granted yet; this deliberately keeps direct browser table access denied while the server API uses a service-role credential. The server must enforce every user/admin permission itself. Do not treat this as launch-ready until policy design and authorization tests are completed.
- Added a follow-up migration to lock down the user-creation trigger function's execution privileges, set a fixed function search path, and index several foreign-key columns.
- Initial schema has no customer records. No service-role secret was added to the repository.
- Supabase advisors still report informational RLS-enabled/no-policy notices. These are expected for the current server-mediated design, but must be revisited before enabling direct client access. Performance advisor may still flag indexes as unused on a fresh, empty database.
- **Still incomplete:** align and commit SQL migration files in the repository; add/verify per-user RLS policies if browser database access is needed; create the first admin account securely; configure Supabase Auth URL/redirect/email settings; update API permission checks and fix identified route/validation defects; add integration/security tests; run CI and local build; configure hosting/domain and production secrets.
- Never send KYC documents to public storage. Before accepting any sensitive documents, configure a private storage bucket and narrowly scoped, tested access rules; avoid collecting full tax IDs until legal and retention requirements are approved.
- This backend setup is a meaningful foundation step, not a finished or deployed website. Keep Phase 1 marked **in progress** until the remaining checks above pass.


## API security follow-up — 2026-10-29

- Added a same-origin check for requests that include an Origin header, using the configured `ALLOWED_ORIGIN`.
- Corrected the inquiry email-validation pattern and dealer-application PATCH route matcher.
- Added permission checks to admin review listing, review moderation, and review replies; these use the existing order-management permission until a dedicated review permission is designed.
- Stopped treating browser-supplied current prices as authoritative quote prices. Quote item snapshots are explicitly marked as client-provided reference data only. Inventory/price must be independently fetched and verified before any sale.
- Added promotion columns required by the current API to the Supabase database.
- CI was triggered for the server changes; do not mark this work validated until the workflow finishes successfully and remaining authorization/integration tests are added.
- Remaining high-priority work: commit the exact applied SQL migrations into the repository; add automated tests for unauthorized admin requests, origin handling, malformed input, and quote identity; verify all API queries against the live schema; implement verified inventory checks and durable rate limiting; configure Auth/email settings; and complete a security review before production.


## Repository hardening follow-up — 2026-10-29

- Corrected the inquiry email validation expression and added a permission check to the admin review-status endpoint. GitHub Actions CI passed for commit `aac22bf3874a7437b4b0329f779d98a7a5ab0ad3` (run 55).
- Added `.env` and `.env.*` ignore rules while preserving `.env.example`; local secrets should never be committed.
- Added the SQL migration file for the promotion columns already applied to Supabase.
- **Migration tracking is still incomplete:** the initial schema and function/index hardening migrations are recorded in the live Supabase migration history but their matching SQL files have not yet been reconstructed and committed. Do not claim the database can be recreated from repository migrations until those files are restored and tested against a clean database.
- The Supabase security advisor currently reports 10 informational `rls_enabled_no_policy` notices. Direct browser table access is intentionally not enabled; the server uses a privileged database key and must continue enforcing access checks. Keep production launch blocked until authorization and cross-account tests are complete.
