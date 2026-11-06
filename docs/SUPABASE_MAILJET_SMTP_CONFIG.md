# Supabase Custom SMTP Configuration Guide (Mailjet)

**Project Name**: `heyman-diamond-website`  
**Supabase Project Ref**: `qdjqdbuozbgghasmeksw`  
**Supabase Region**: `us-east-1`  
**Supabase API Base**: `https://qdjqdbuozbgghasmeksw.supabase.co`  
**Target Live Host**: `https://hey-man-diamond-test.onrender.com` / Custom Domains  

---

## 1. Executive Summary & Purpose

By default, Supabase Auth (GoTrue) utilizes a shared transactional email infrastructure that imposes a strict limit of **3 emails per hour**. Under this default configuration, signup verification, password resets, and confirmation resends fail immediately once 3 emails have been dispatched within an hour, returning HTTP 429 rate limit errors to users.

To support live customer and dealer onboarding at scale, **Custom SMTP** must be enabled in the Supabase project dashboard using **Mailjet** as the outbound SMTP relay. Configuring Custom SMTP transfers outbound transactional email to Heyman Diamond's dedicated Mailjet account, immediately **lifting the 3-emails/hour restriction** and providing high deliverability with authenticated SPF and DKIM signatures.

---

## 2. Exact Custom SMTP Configuration Parameters

Enter these parameters in the Supabase Dashboard under **Project Settings / Authentication / SMTP Settings**:

| Parameter Field | Value / Recommended Setting | Description |
| :--- | :--- | :--- |
| **Sender Email** | `no-reply@heymandiamond.com`<br>*(or verified address on `heymandiamondllc.com`)* | Must match a domain or sender address verified in your Mailjet account. |
| **Sender Name** | `Heyman Diamond` *(or `Heyman Diamond LLC`)* | Friendly sender name displayed in customer inboxes. |
| **SMTP Host** | `in-v3.mailjet.com` | Mailjet transactional SMTP relay host. |
| **SMTP Port** | `587` *(Recommended)* or `465` | Port `587` uses STARTTLS. Port `465` uses implicit SSL/TLS. |
| **Minimum Encryption** | `STARTTLS` *(for port 587)* or `SSL` *(for port 465)* | Secure transport encryption protocol. |
| **SMTP Username** | `<Mailjet API Public Key>` | Found in Mailjet Dashboard under **Account Settings → REST API / SMTP Credentials**. |
| **SMTP Password** | `<Mailjet Secret Key>` | Generated alongside your Mailjet API Public Key. |

---

## 3. Step-by-Step Instructions for Project `qdjqdbuozbgghasmeksw`

### Step 3.1: Locate Mailjet SMTP Credentials
1. Log in to the [Mailjet Dashboard](https://app.mailjet.com).
2. In the top-right account menu, navigate to **Account Settings** → **REST API** → **API Key Management (Primary and Sub-account)**.
3. Note your **API Key** (used as SMTP Username) and **Secret Key** (used as SMTP Password).
4. Verify under **Sender Domains & Addresses** that `heymandiamond.com` (or `no-reply@heymandiamond.com`) displays status **Active / Validated**.

### Step 3.2: Enable Custom SMTP in Supabase
1. Log in to the [Supabase Dashboard](https://supabase.com/dashboard/project/qdjqdbuozbgghasmeksw).
2. In the left navigation menu, navigate to **Project Settings** (gear icon) → **Authentication**.
3. Scroll down to the **SMTP Settings** card.
4. Toggle **Enable Custom SMTP** to **ON (Enabled)**.
5. Fill in the fields:
   - **Sender email**: `no-reply@heymandiamond.com`
   - **Sender name**: `Heyman Diamond`
   - **Host**: `in-v3.mailjet.com`
   - **Port number**: `587`
   - **Minimum Encryption**: `STARTTLS`
   - **Username**: `<Paste Mailjet API Public Key>`
   - **Password**: `<Paste Mailjet Secret Key>`
6. Click **Save** in the bottom right corner of the card.

---

## 4. URL Configuration (Site URL & Redirect URLs)

To ensure that the confirmation link in the verification email routes users back to the frontend application correctly, configure URL whitelisting in Supabase:

1. In Supabase Dashboard, go to **Authentication** → **URL Configuration**.
2. **Site URL**:
   - Set to: `https://heymandiamond.com` (or `https://heymandiamondllc.com` once custom domain DNS is cut over).
3. **Redirect URLs (Allow list)**:
   Add each of the following URLs so GoTrue permits email verification callbacks across development, staging, and production environments:
   ```text
   https://heymandiamond.com/#signin
   https://heymandiamond.com/**
   https://www.heymandiamond.com/#signin
   https://www.heymandiamond.com/**
   https://heymandiamondllc.com/#signin
   https://heymandiamondllc.com/**
   https://www.heymandiamondllc.com/#signin
   https://www.heymandiamondllc.com/**
   https://hey-man-diamond-test.onrender.com/#signin
   https://hey-man-diamond-test.onrender.com/**
   http://localhost:5173/#signin
   http://localhost:5173/**
   ```
4. Click **Save**.

---

## 5. Email Templates Configuration

Under **Authentication** → **Email Templates**:

### 5.1 Confirm Signup (`Confirm your signup`)
- **Subject**: `Confirm your Heyman Diamond account`
- **Body**:
  ```html
  <h2>Welcome to Heyman Diamond</h2>
  <p>Thank you for registering your account with Heyman Diamond LLC.</p>
  <p>Please confirm your email address by clicking the link below:</p>
  <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;background-color:#1a1a1a;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:600;">Confirm Email Address</a></p>
  <p>If you did not sign up for an account, please disregard this email.</p>
  ```

### 5.2 Reset Password (`Reset password`)
- **Subject**: `Reset your Heyman Diamond password`
- **Body**:
  ```html
  <h2>Reset Your Password</h2>
  <p>A request was received to reset the password for your Heyman Diamond account.</p>
  <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;background-color:#1a1a1a;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:600;">Reset Password</a></p>
  <p>If you did not request a password reset, you can safely ignore this message.</p>
  ```

---

## 6. Deliverability & Rate Limit Verification

1. **Rate Limit Removal**:
   - Once Custom SMTP is toggled on with Mailjet, the built-in Supabase 3-emails/hour throttle is completely bypassed.
   - Sending limits are now determined solely by your Mailjet account tier (e.g. 6,000 emails/month on Free tier; up to 15,000+ on Essential tiers).
2. **SPF & DKIM Alignment**:
   - Because DKIM (`mailjet._domainkey.heymandiamond.com`) and merged SPF (`include:spf.mailjet.com`) are configured on your DNS, emails pass DMARC alignment, avoiding the spam/junk folder.
3. **Live Verification**:
   - Trigger a signup via `POST /api/auth/signup` or run the synthetic validation script `node scripts/validate_live_auth.mjs`.
   - Inspect the Mailjet Activity Dashboard ([app.mailjet.com/stats](https://app.mailjet.com/stats)) to verify the email status is `Opened` or `Delivered`.
