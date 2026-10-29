# Hey Man Diamond LLC — delivery plan

## Product goals
- Responsive luxury website for retail customers and diamond professionals.
- Flomiz-backed diamond catalog with search, filters, fresh stock and safe product fields.
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
- Never put Flomiz credentials, database service-role keys, payment secrets or email API keys in browser code or VITE_ variables.
- Never trust client-supplied role, price, discount, stock or order total.
- Enforce dealer permissions server-side.
- Never link anonymous review emails to accounts without email verification.
- Restrict KYC to authorized reviewers; audit status changes.
- Revalidate stock and prices before accepting orders; make checkout idempotent.
- Enable RLS and test unauthorized access.

## Local validation
Run in the project folder:
    npm.cmd install
    npm.cmd run lint
    npm.cmd run build

A green build verifies frontend compilation only; it does not verify integrations or production readiness.
