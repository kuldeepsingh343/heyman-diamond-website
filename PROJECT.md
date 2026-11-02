# Project: Heyman Diamond Auth & Domain Integration

## Architecture
The system employs a server-mediated architecture where the React SPA frontend communicates exclusively with a Node.js HTTP server (`server/index.mjs`) deployed on Render (`https://hey-man-diamond-test.onrender.com`).
- **Frontend**: React 19 SPA with hash-based routing (`/#home`, `/#signup-customer`, `/#signup-dealer`, `/#signin`).
- **Backend API**: Node.js HTTP server serving static files from `dist/` and providing `/api/*` endpoints. Interacts directly with Supabase GoTrue Auth REST API (`/auth/v1/*`) and PostgREST (`/rest/v1/*`) using `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`.
- **Database & Auth**: Supabase project `heyman-diamond-website` (`qdjqdbuozbgghasmeksw`, `us-east-1`). Client table and function privileges are 100% revoked from `anon` and `authenticated`. RBAC is stored in `public.profiles` (`account_type`: `'customer'` | `'dealer'`, `dealer_status`: `'not_applied'` | `'pending_review'` | `'approved'`), `public.dealer_applications`, and `public.admin_users`.
- **Email Delivery**: Supabase GoTrue handles transactional emails (confirmation, recovery) via Mailjet Custom SMTP relay (`in-v3.mailjet.com:587`), lifting the default 3-emails/hour rate limit.
- **DNS & Hosting**: Custom domain (`heymandiamond.com` / `heymandiamondllc.com`) hosted on InMotion / Cloudflare DNS, pointing web traffic to Render while decoupling mail to an explicit A record (`mail.heymandiamond.com`) to prevent inbound email outages, while preserving Mailjet DKIM and merging SPF.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Custom SMTP Parameters | Exact Mailjet host, port, encryption, and sender email parameters | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Supabase SMTP Configuration Guide | Step-by-step instructions to configure Mailjet SMTP in Supabase project `qdjqdbuozbgghasmeksw` | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Rate-Limit Removal Verification | Lift 3-emails/hour rate limit for signup and confirmation resends | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Email Routing Decoupling | Convert `mail.` from CNAME to A record and update MX to isolate email from apex web changes | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Mailjet SPF & DKIM Preservation | Merge SPF with `include:spf.mailjet.com` and preserve `mailjet._domainkey` DKIM record | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Render Custom Domain DNS Records | Exact A and CNAME records to point domain from InMotion/Cloudflare to Render | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Configurable Server Redirect & Origins | Support custom domain and Render URL dynamically for auth redirects and CORS | M3 | Survey Explorer 1 & 3 |
| 8 | Hash Route Token Matching Fix | Fix `src/App.tsx` regex so `#access_token=...` mounts `AuthPages` and saves session | M3 | Survey Explorer 1 |
| 9 | Synthetic Customer Auth Flow Validation | Live customer signup, Mailjet confirmation receipt, link activation, and signin | M4 | ORIGINAL_REQUEST §R3 |
| 10 | Synthetic Dealer Auth Flow Validation | Live dealer signup, pending review status, admin approval, and post-approval signin | M4 | ORIGINAL_REQUEST §R3 |
| 11 | Zero-Pollution Database Cleanup | Automated cascade cleanup of synthetic test accounts respecting foreign key constraints | M4 | Survey Explorer 3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Supabase Custom SMTP Configuration | Configure Mailjet SMTP (`in-v3.mailjet.com:587`) for Supabase project `qdjqdbuozbgghasmeksw` and document parameters | none | PLANNED |
| M2 | DNS & Custom Domain Migration Plan | Specify exact InMotion/Cloudflare DNS records, email decoupling (`mail` A record + MX), and Mailjet SPF/DKIM preservation | none | PLANNED |
| M3 | Codebase URL & Auth Verification Fixes | Make redirect URLs configurable in `server/index.mjs` and fix hash routing regex in `src/App.tsx` | none | PLANNED |
| M4 | Live Customer & Dealer Auth Verification | Execute synthetic testing protocol on live deployment and verify role permissions & zero pollution | M1, M2, M3 | PLANNED |

## Interface Contracts
### Supabase Auth ↔ Mailjet SMTP
- Host: `in-v3.mailjet.com`
- Port: `587` (StartTLS) or `465` (SSL)
- User: Mailjet API Key
- Pass: Mailjet Secret Key
- Sender: `no-reply@heymandiamond.com` (or verified sender on `heymandiamondllc.com`)
- Sender Name: `Heyman Diamond`

### InMotion / Cloudflare DNS ↔ Mailjet & Render
- `mail.heymandiamond.com`: `A` -> `213.165.230.74`
- `heymandiamond.com`: `MX 0` -> `mail.heymandiamond.com.`
- `heymandiamond.com`: `TXT` -> `v=spf1 +mx +a +ip4:213.165.230.74 +ip4:23.235.219.240 +include:relay.mailchannels.net include:spf.mailjet.com ~all`
- `mailjet._domainkey.heymandiamond.com`: `TXT` -> `k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApP50J...` (UNTOUCHED)
- `heymandiamond.com`: `A` -> `216.24.57.1` (or CNAME flattening to `hey-man-diamond-test.onrender.com` on Cloudflare)
- `www.heymandiamond.com`: `CNAME` -> `hey-man-diamond-test.onrender.com`

### Frontend ↔ Backend Auth Protocol
- `POST /api/auth/signup`:
  - Body: `{ accountType, fullName, address, phone, gender, email, password, companyName? }`
  - Response: `{ submitted: true, emailConfirmationRequired: true, accountType, message }`
- `POST /api/auth/signin`:
  - Body: `{ email, password }`
  - Response: `{ accessToken, refreshToken, expiresIn, user: { email, account_type, dealer_status, full_name } }`
- Confirmation URL:
  - `<SUPABASE_URL>/auth/v1/verify?token=...&type=signup&redirect_to=<APP_URL>/#signin`
  - Redirect destination: `<APP_URL>/#access_token=...&refresh_token=...&type=signup`

## Code Layout
- `server/index.mjs`: Node HTTP server, GoTrue REST auth proxy, PostgREST DB proxy, SPA static server.
- `src/App.tsx`: Main React component and client hash routing.
- `src/AuthPages.tsx`: Customer & dealer registration, login, confirmation banner, token interceptor.
- `supabase/migrations/`: Database schema, tables (`profiles`, `dealer_applications`, `admin_users`), and RLS privilege revocation.
- `tests/`: Automated unit and migration test suites.
- `dist/`: Compiled production frontend assets.
