# Heyman Diamond — DNS & Render Domain Migration Guide

**Active Production Domain**: `heymandiamond.com` *(and identical configuration for `heymandiamondllc.com`)*  
**Current Mail & Web Server**: InMotion Hosting (`213.165.230.74`, Relay IP `23.235.219.240`)  
**Target Web Application**: Render Web Service (`https://hey-man-diamond-test.onrender.com`)  
**Auth / Transactional Email Provider**: Mailjet via Supabase GoTrue (`in-v3.mailjet.com:587`)  

---

> ### 🔒 MANDATORY OPERATIONAL NOTICE — FUTURE USE ONLY
> **The live production domain `heymandiamond.com` is actively serving the legacy business website and MUST NOT be modified, queried disruptively, or repointed at this time.**  
> All ongoing development, automated testing, and synthetic user verification must strictly target the Render test environment (`https://hey-man-diamond-test.onrender.com`) or local development (`http://localhost:3000`).  
> This migration guide is an operational runbook reserved strictly for execution during the scheduled production maintenance window **after** the client reviews and explicitly approves the new website.

---

## 1. Executive Summary & Critical Email Protection Notice

### ⚠️ The Apex / MX Coupling Trap (Preventing Catastrophic Email Outage)
Currently on `heymandiamond.com`, the MX record points directly to the apex domain:
```text
heymandiamond.com.    IN  MX    0  heymandiamond.com.
mail.heymandiamond.com. IN  CNAME heymandiamond.com.
```
If an administrator points the apex domain (`heymandiamond.com`) to Render's web load balancer (`216.24.57.1` or CNAME `hey-man-diamond-test.onrender.com`) **without first decoupling email**:
1. All public mail transfer agents (MTAs) delivering email to `sales@heymandiamond.com`, `amy@heymandiamond.com`, etc., will resolve the MX target to Render's IP address.
2. Render does **not** run an SMTP inbound server on port 25.
3. **All inbound business email will immediately bounce, causing severe operational disruption.**
4. Additionally, desktop and mobile email clients connecting to `mail.heymandiamond.com` will fail because `mail` is a CNAME pointing to the apex.

### The Decoupling Solution
Before pointing any web traffic to Render:
1. Convert `mail.heymandiamond.com` from a CNAME into an **explicit A record** pointing to InMotion's mail server IP: `213.165.230.74`.
2. Update the domain's MX record to point to `0 mail.heymandiamond.com.` instead of the apex.
3. This cleanly separates web traffic (routed to Render) from inbound email traffic (routed to InMotion), guaranteeing zero email downtime.

---

## 2. Complete Master DNS Record Table

Apply the following records in your authoritative DNS zone editor:

| Record Type | Host / Name | Target / Value | Priority | TTL | Action / Status | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A** | `mail` | `213.165.230.74` | — | 300 | **Convert from CNAME to A** | Decouples inbound mail server from apex domain |
| **MX** | `@` *(root)* | `mail.heymandiamond.com.` | `0` | 300 | **Update Target** | Routes inbound email to decoupled InMotion mail server |
| **CNAME** | `www` | `hey-man-diamond-test.onrender.com` | — | 300 | **Update Target** | Routes `www` web traffic to Render |
| **CNAME** *(Cloudflare)*<br>OR **A** *(InMotion)* | `@` *(root)* | `hey-man-diamond-test.onrender.com` *(Cloudflare CNAME flattening)*<br>OR `216.24.57.1` *(InMotion A record)* | — | 300 | **Update Target** | Routes root apex web traffic to Render |
| **TXT** | `mailjet._domainkey` | `k=rsa; p=...` *(2048-bit RSA SPKI public key, 392 base64 characters chunked per RFC 1035 §3.3.14)* | — | 300 | **PRESERVE UNTOUCHED** | Cryptographic DKIM authentication signature for Mailjet; active Cloudflare record is already valid |
| **TXT** | `@` *(root)* | `v=spf1 +mx +a +ip4:213.165.230.74 +ip4:23.235.219.240 +include:relay.mailchannels.net include:spf.mailjet.com ~all` | — | 300 | **Update (Merge Mailjet)** | Authorizes InMotion webmail, relays, and Mailjet |
| **A** | `cpanel` | `213.165.230.74` | — | 300 | **Preserve** | Direct access to InMotion cPanel control panel |
| **A** | `webmail` | `213.165.230.74` | — | 300 | **Preserve** | Direct access to InMotion Webmail |

---

## 3. Preserving Mailjet DKIM and Merging SPF

### 3.1 Preserving DKIM & RFC 1035 §3.3.14 Multi-String Chunking

#### Understanding 2048-Bit RSA Key Chunking
- A standard 2048-bit RSA public key encoded in ASN.1 SubjectPublicKeyInfo (SPKI) DER requires **294 raw bytes**, which encodes to **392 base64 characters**.
- Preceded by the standard DKIM tag `k=rsa; p=`, the full TXT record payload is approximately **401 characters**.
- **RFC 1035 §3.3.14** limits an individual `<character-string>` within a DNS TXT record to 255 octets. Any DNS record payload exceeding 255 bytes must be segmented into multiple concatenated quoted strings within the same TXT resource record.
- In Cloudflare DNS (and standard zone files), the 401-character DKIM string is divided across two contiguous chunks:
  - **Chunk 1** (first 255 characters): `"k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApP50J+7Xlki0/urQPmZacqQhMRIitETn9aXzHyuIDZuM8EyZTzRPd0Kw0J6KvXTHFAKq9hCKpEljHFwC6ZEAu0QtshdioImse0PXrW+26NTPjIgTaN2bKX2IMdHhr2NM200izgsVipREmcxuyHxyZHA8cIuo68KphUp7xlU8rAMUk5oE3+DLIeAn3AbgHKSTh/3Yw1It6g"`
  - **Chunk 2** (remaining 146 characters containing the modulus completion and exponent): `"<CHUNK_2_REMAINDER>"`
- Standard-compliant DNS resolvers automatically reassemble all string chunks in sequence during DNS lookups to reconstruct the complete 392-character public key.

#### Critical Operational Instructions:
1. **Existing Cloudflare Record (Active Production)**:  
   The existing `mailjet._domainkey.heymandiamond.com` record on Cloudflare already contains both chunks and cryptographically validates live Mailjet emails. **LEAVE THIS RECORD COMPLETELY UNTOUCHED.**
2. **If Migrating to InMotion cPanel or Configuring a New Domain (`heymandiamondllc.com`)**:  
   - **Never copy a single truncated string**: Basic command line queries like `dig +short` or naive web exports often truncate at the first 255-character chunk boundary. Documenting or copying only Chunk 1 results in an incomplete 184-byte ASN.1 key missing 110 bytes (and lacking the public exponent), which causes cryptographic parsing failure (`Failed to read asymmetric key`) and causes MTAs (Google, Microsoft, Yahoo) to reject transactional emails.
   - **Retrieve Full Key**: Always retrieve the complete, untruncated 392-character SPKI public key directly from the **Mailjet Dashboard** (`Account Settings` → `Senders & Domains` → `Domain Validation`) or export the complete multi-part zone record from Cloudflare.
   - When entering into InMotion cPanel Zone Editor or standard BIND DNS zone files, enter both quoted chunks together:
     ```text
     "k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApP50J+7Xlki0/urQPmZacqQhMRIitETn9aXzHyuIDZuM8EyZTzRPd0Kw0J6KvXTHFAKq9hCKpEljHFwC6ZEAu0QtshdioImse0PXrW+26NTPjIgTaN2bKX2IMdHhr2NM200izgsVipREmcxuyHxyZHA8cIuo68KphUp7xlU8rAMUk5oE3+DLIeAn3AbgHKSTh/3Yw1It6g" "<CHUNK_2_REMAINDER>"
     ```

### 3.2 Single Merged SPF Record (RFC 7208 Compliance)
RFC 7208 §3.2 states that a domain name MUST NOT have more than one SPF record published; multiple SPF records cause an automatic SPF `PermError` and failure of mail delivery.

- **Current SPF**:
  `v=spf1 +mx +a +ip4:23.235.219.240 +include:relay.mailchannels.net ~all`
- **Updated SPF (Merged)**:
  `v=spf1 +mx +a +ip4:213.165.230.74 +ip4:23.235.219.240 +include:relay.mailchannels.net include:spf.mailjet.com ~all`

**Components Explained**:
- `+mx`: Authorizes the host defined in your MX record (`mail.heymandiamond.com`).
- `+a`: Authorizes the apex hostname.
- `+ip4:213.165.230.74`: Authorizes InMotion's primary server IP.
- `+ip4:23.235.219.240`: Authorizes InMotion's outbound mail relay pool.
- `+include:relay.mailchannels.net`: Authorizes InMotion's MailChannels spam filtering relay.
- `include:spf.mailjet.com`: Authorizes Mailjet's outbound sending cluster for Supabase Auth emails.
- `~all`: Soft-fail policy for unauthorized senders.

---

## 4. Step-by-Step Migration Execution

### Step 4.1: Render Dashboard Setup
1. Log in to the [Render Dashboard](https://dashboard.render.com).
2. Select the web service: `hey-man-diamond-test`.
3. In the left navigation, click **Settings**.
4. Scroll down to the **Custom Domains** section.
5. Click **Add Custom Domain** and enter:
   - `heymandiamond.com`
   - `www.heymandiamond.com`
   *(If configuring `heymandiamondllc.com`, add both `heymandiamondllc.com` and `www.heymandiamondllc.com`).*
6. Render will verify DNS records and automatically issue free Let's Encrypt SSL/TLS certificates.

---

### Step 4.2: Option A — DNS Configuration in Cloudflare (Active Nameservers)

*Note: The authoritative nameservers for `heymandiamond.com` are currently delegated to Cloudflare (`seth.ns.cloudflare.com` and `violet.ns.cloudflare.com`). Use this option if you manage DNS via Cloudflare:*

1. Log in to your Cloudflare dashboard and select `heymandiamond.com`.
2. Go to **DNS** → **Records**.
3. **Decouple Mail**:
   - Locate `mail`. If it exists as a CNAME, delete it.
   - Click **Add record**:
     - Type: `A`
     - Name: `mail`
     - IPv4 address: `213.165.230.74`
     - Proxy status: **DNS only (Grey Cloud)** *(Critical: Cloudflare proxying port 80/443 must not proxy mail protocols)*.
     - TTL: Auto.
4. **Update MX Record**:
   - Locate the `MX` record. Edit it:
     - Name: `@`
     - Mail server: `mail.heymandiamond.com`
     - Priority: `0`
     - TTL: Auto.
5. **Update SPF Record**:
   - Locate the root `TXT` record starting with `v=spf1`.
   - Update content to:
     `v=spf1 +mx +a +ip4:213.165.230.74 +ip4:23.235.219.240 +include:relay.mailchannels.net include:spf.mailjet.com ~all`
6. **Point Web Traffic to Render**:
   - Locate the `A` record for `@` (pointing to `213.165.230.74`).
   - Change or replace it with a **CNAME record**:
     - Type: `CNAME`
     - Name: `@`
     - Target: `hey-man-diamond-test.onrender.com`
     - Proxy status: **DNS only (Grey Cloud)**.  
       *⚠️ MANDATORY: Proxy status MUST be set to "DNS only (Grey Cloud)" during initial Render domain verification and Let's Encrypt SSL/TLS certificate generation. If Cloudflare Orange Cloud (proxied) is enabled before certificate provisioning completes, Render's automated ACME HTTP-01 challenge cannot verify domain ownership and certificate issuance will fail. Once Render shows a green "Verified" checkmark and active SSL certificate, Cloudflare proxying (Orange Cloud) may optionally be re-enabled, provided Cloudflare SSL/TLS encryption mode is set to "Full (strict)".*
   - Locate the `www` record:
     - Type: `CNAME`
     - Name: `www`
     - Target: `hey-man-diamond-test.onrender.com`
     - Proxy status: **DNS only (Grey Cloud)** *(keep Grey Cloud until Render verification completes)*.
   - Ensure any existing `AAAA` records for `@` or `www` are removed.

---

### Step 4.3: Option B — DNS Configuration in InMotion cPanel Zone Editor

*Use this option if you switch authoritative nameservers back to InMotion (`ns1.inmotionhosting.com`, `ns2.inmotionhosting.com`) or manage DNS directly in cPanel:*

1. Log in to InMotion cPanel (`https://cpanel.heymandiamond.com` or via InMotion Account Management Panel).
2. Under **Domains**, open **Zone Editor**.
3. Next to `heymandiamond.com`, click **Manage**.
4. **Decouple Mail**:
   - Find `mail.heymandiamond.com`. If it is a CNAME, click **Edit**, change Type to **A**, and set Record to `213.165.230.74`.
5. **Update MX**:
   - Find the MX record for `heymandiamond.com`.
   - Edit the destination to `mail.heymandiamond.com.` with Priority `0`.
6. **Update SPF Record**:
   - Find the TXT record for `heymandiamond.com` starting with `v=spf1`.
   - Edit the text to:
     `v=spf1 +mx +a +ip4:213.165.230.74 +ip4:23.235.219.240 +include:relay.mailchannels.net include:spf.mailjet.com ~all`
7. **Point Web Traffic to Render**:
   - Find the `A` record for `heymandiamond.com.`:
     - Edit Record to Render's load balancer IP: `216.24.57.1`.
   - Find the `CNAME` record for `www.heymandiamond.com.`:
     - Edit Record to: `hey-man-diamond-test.onrender.com.`.
8. Save all changes.

---

## 5. Post-Migration Verification Commands

Run these commands in your terminal to verify DNS propagation and service integrity:

```bash
# 1. Verify that mail is decoupled to InMotion IP
dig mail.heymandiamond.com A +short
# Expected output: 213.165.230.74

# 2. Verify that MX points to the decoupled mail hostname
dig heymandiamond.com MX +short
# Expected output: 0 mail.heymandiamond.com.

# 3. Verify SPF record includes Mailjet and InMotion IPs
dig heymandiamond.com TXT +short | grep "include:spf.mailjet.com"
# Expected output contains: v=spf1 ... include:spf.mailjet.com ... ~all

# 4. Verify Mailjet DKIM record remains intact (inspect all chunks)
dig mailjet._domainkey.heymandiamond.com TXT
# Expected output contains both concatenated chunks forming the 392-char base64 SPKI key

# 5. Verify www points to Render
dig www.heymandiamond.com CNAME +short
# Expected output: hey-man-diamond-test.onrender.com.

# 6. Verify apex points to Render IP or Render alias
dig heymandiamond.com A +short
# Expected output: 216.24.57.1 (or Cloudflare proxy IPs / CNAME flattened address)

# 7. Verify web application serves HTTP 200 with HTTPS
curl -Iv https://heymandiamond.com
curl -Iv https://www.heymandiamond.com
```

---

## 6. Rollback Plan

If unexpected issues occur during cutover:
1. Revert apex `heymandiamond.com` A record to `213.165.230.74` in DNS manager.
2. Revert `www.heymandiamond.com` CNAME to `heymandiamond.com`.
3. Mail remains unaffected throughout because `mail.heymandiamond.com` and MX point directly to InMotion.
