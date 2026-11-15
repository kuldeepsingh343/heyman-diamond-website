# Supabase Custom SMTP Configuration Guide (sales@heymandiamond.com)

**Project Name**: `heyman-diamond-website`  
**Supabase Project Ref**: `qdjqdbuozbgghasmeksw`  
**Supabase Region**: `us-east-1`  
**Supabase API Base**: `https://qdjqdbuozbgghasmeksw.supabase.co`  
**Target Live Host**: `https://hey-man-diamond-test.onrender.com` / Custom Domains  
**Sender Address**: `sales@heymandiamond.com`  

---

## 1. Executive Summary & Purpose

By default, Supabase Auth (GoTrue) utilizes a shared transactional email infrastructure that imposes a strict limit of **3 emails per hour**. Under this default configuration, signup verification, password resets, and confirmation resends fail immediately once 3 emails have been dispatched within an hour, returning HTTP 429 rate limit errors to users.

To support live customer and dealer onboarding at scale, **Custom SMTP** must be enabled in the Supabase project dashboard using Hey Man Diamond's dedicated SMTP server and official business email address: **`sales@heymandiamond.com`**. Configuring Custom SMTP transfers outbound transactional email to the company's dedicated mail server, immediately **lifting the 3-emails/hour restriction** and guaranteeing authenticated delivery with your domain's SPF and DKIM signatures.

---

## 2. Exact Custom SMTP Configuration Parameters

Enter these parameters in the Supabase Dashboard under **Project Settings / Authentication / SMTP Settings**:

| Parameter Field | Value / Recommended Setting | Description |
| :--- | :--- | :--- |
| **Sender Email** | `sales@heymandiamond.com` | Official business sender address. |
| **Sender Name** | `Heyman Diamond LLC` | Friendly sender name displayed in customer inboxes. |
| **SMTP Host** | `mail.heymandiamond.com` *(or your cPanel/mail host IP `213.165.230.74`)* | Dedicated company outbound SMTP host. |
| **SMTP Port** | `587` *(STARTTLS)* or `465` *(SSL/TLS)* | Port `587` is standard for STARTTLS submission; port `465` for SSL. |
| **Minimum Encryption** | `STARTTLS` *(for port 587)* or `SSL` *(for port 465)* | Secure transport encryption protocol. |
| **SMTP Username** | `sales@heymandiamond.com` | Full email address of the mailbox. |
| **SMTP Password** | `<Your SMTP Mailbox Password>` | Password for `sales@heymandiamond.com`. |

---

## 3. Step-by-Step Instructions for Project `qdjqdbuozbgghasmeksw`

### Step 3.1: Enable Custom SMTP in Supabase
1. Log in to the [Supabase Dashboard](https://supabase.com/dashboard/project/qdjqdbuozbgghasmeksw).
2. In the left navigation menu, navigate to **Project Settings** (gear icon) → **Authentication**.
3. Scroll down to the **SMTP Settings** card.
4. Toggle **Enable Custom SMTP** to **ON (Enabled)**.
5. Fill in the fields:
   - **Sender email**: `sales@heymandiamond.com`
   - **Sender name**: `Heyman Diamond LLC`
   - **Host**: `mail.heymandiamond.com` *(or `213.165.230.74`)*
   - **Port**: `587` (or `465`)
   - **Minimum encryption**: `STARTTLS` (or `SSL`)
   - **Username**: `sales@heymandiamond.com`
   - **Password**: `<Password for sales@heymandiamond.com>`
6. Click **Save Changes** at the bottom of the card.

---

## 4. Verification Checklist

1. **Rate-Limit Bypass**: Once Custom SMTP is toggled on with `sales@heymandiamond.com`, the built-in Supabase 3-emails/hour throttle is completely bypassed.
2. **DMARC & Inbox Placement**: Because emails originate directly from your authenticated domain with active SPF and DKIM on `heymandiamond.com`, customer onboarding emails land in the primary inbox rather than Spam/Junk.
3. **End-to-End Test**:
   - Register a new test account at `/#signup-customer`.
   - Verify the confirmation email arrives from **`Heyman Diamond LLC <sales@heymandiamond.com>`**.
