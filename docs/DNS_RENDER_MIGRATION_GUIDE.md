# Heyman Diamond — DNS & Render Domain Migration Guide

**Active Production Domain**: `heymandiamond.com` *(and identical configuration for `heymandiamondllc.com`)*  
**Current Mail & Web Server**: InMotion Hosting (`213.165.230.74`, Relay IP `23.235.219.240`)  
**Target Web Application**: Render Web Service (`https://hey-man-diamond-test.onrender.com`)  
**Auth / Transactional Email Provider**: Mailjet via Supabase GoTrue (`in-v3.mailjet.com:587`)  

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
| **TXT** | `mailjet._domainkey` | `k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApP50J+7Xlki0/urQPmZacqQhMRIitETn9aXzHyuIDZuM8EyZTzRPd0Kw0J6KvXTHFAKq9hCKpEljHFwC6ZEAu0QtshdioImse0PXrW+26NTPjIgTaN2bKX2IMdHhr2NM200izgsVipREmcxuyHxyZHA8cIuo68KphUp7xlU8rAMUk5oE3+DLIeAn3AbgHKSTh/3Yw1It6g` | — | 300 | **PRESERVE UNTOUCHED** | Cryptographic DKIM public key for Mailjet |
| **TXT** | `@` *(root)* | `v=spf1 +mx +a +ip4:213.165.230.74 +ip4:23.235.219.240 +include:relay.mailchannels.net include:spf.mailjet.com ~all` | — | 300 | **Update (Merge Mailjet)** | Authorizes InMotion webmail, relays, and Mailjet |
| **A** | `cpanel` | `213.165.230.74` | — | 300 | **Preserve** | Direct access to InMotion cPanel control panel |
| **A** | `webmail` | `213.165.230.74` | — | 300 | **Preserve** | Direct access to InMotion Webmail |

---

## 3. Preserving Mailjet DKIM and Merging SPF

### 3.1 Preserving DKIM
The DKIM TXT record at host `mailjet._domainkey.heymandiamond.com` is already published with the 2048-bit RSA public key:
```text
k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApP50J+7Xlki0/urQPmZacqQhMRIitETn9aXzHyuIDZuM8EyZTzRPd0Kw0J6KvXTHFAKq9hCKpEljHFwC6ZEAu0QtshdioImse0PXrW+26NTPjIgTaN2bKX2IMdHhr2NM200izgsVipREmcxuyHxyZHA8cIuo68KphUp7xlU8rAMUk5oE3+DLIeAn3AbgHKSTh/3Yw1It6g
```
**Rule**: Do NOT modify or delete this record. It is actively required by Mailjet to cryptographically sign transactional emails from Supabase Auth so they pass DMARC and inbox validation.

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
     - Proxy status: **DNS only** (or Proxied if SSL mode is set to Full Strict).
   - Locate the `www` record:
     - Type: `CNAME`
     - Name: `www`
     - Target: `hey-man-diamond-test.onrender.com`
     - Proxy status: **DNS only** (or Proxied).
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

# 4. Verify Mailjet DKIM record remains intact
dig mailjet._domainkey.heymandiamond.com TXT +short
# Expected output: "k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApP50J..."

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
