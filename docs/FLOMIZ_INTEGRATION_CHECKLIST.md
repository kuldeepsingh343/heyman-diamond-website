# Flomiz Stock API — Pull Integration Guide (Hey Man Diamond LLC)

Version 1.0 · Format: JSON over HTTPS · Method: **Pull**

This integration connects Hey Man Diamond LLC to the official Flomiz Stock Pull API to automatically fetch, normalize, and publish certified lab-grown diamond stock.

---

## 1. Verified API Specification

- **Endpoint**: `GET {baseUrl}/api/stock-api/products`
- **Method**: `GET`
- **Authentication**: Sent in request header:
  ```http
  x-api-key: <FLOMIZ_API_KEY>
  ```
- **Optional Query Parameters**:
  - `Page`: 1-based page number (e.g., `?Page=1`)
  - `PerPage`: Items per page (e.g., `?PerPage=100`)
  - Omit both to receive all sellable products in one full snapshot.

---

## 2. Environment Variables

| Variable | Description | Value |
|---|---|---|
| `FLOMIZ_API_KEY` | Issued live API key | Set in Render Environment Variables (starts with `sk_live_...`) |
| `FLOMIZ_BASE_URL` | Flomiz instance domain | The Flomiz server domain provided with your key (e.g. `https://diamond.flomiz.com` or custom instance URL) |

---

## 3. Critical Requirement: Outbound IP / Domain Allowlist

Per Flomiz security rules (Section 2 of the official guide):
> **Origin allowlist (mandatory):** Your key is locked to the source IP(s) / CIDR range(s) or domain(s) you register with the Flomiz administrator. Requests from any other origin are rejected with `401 Authentication failed`.

### Action Required:
Share your deployment outbound IP or domain with the Flomiz administrator:
1. **Render Deployment Domain**: `hey-man-diamond-test.onrender.com`
2. **Production Domain (when cut over)**: `heymandiamond.com` / `heymandiamondllc.com`

---

## 4. Normalization and Field Mapping

Flomiz returns 21 fixed fields followed by dynamic stone properties. The backend (`server/services/inventory.mjs`) automatically normalizes them into Hey Man Diamond's standard diamond format:

| Flomiz Field | Normalized Property | Note |
|---|---|---|
| `SKU` / `ProductName` | `sku` | Unique stone inventory code |
| `Shape` | `shape` | Title-cased diamond shape (Round, Oval, etc.) |
| `AvailableForSale` / `Stock` | `carat` | Physical available carat weight |
| `Color` | `color` | Color grade (D, E, F, G, etc.) |
| `Clarity` | `clarity` | Clarity grade (FL, IF, VVS1, VS1, etc.) |
| `Cut` | `cut` | Cut grade (Ideal, Excellent, etc.) |
| `Polish` / `Symmetry` | `polish` / `symmetry` | Finish grades |
| `Fluorescence` | `fluorescence` | Fluorescence (None, Faint, etc.) |
| `Lab` | `lab` | Grading lab (IGI, GIA) |
| `CertificateNo` | `certificateNumber` | Diamond report number |
| `PricePerCarat` | `pricePerCarat` | Supplier price per carat |
| `TotalPrice` | `wholesalePrice` | Trade cost (visible to approved dealers only) |
| `TotalPrice * 1.30` | `price` | Retail customer price with standard margin |
| `Measurement` | `measurements` | Dimensions in millimeters |
| `lstImages` | `imageUrl` | Diamond photography |

---

## 5. Rate Limits & Smart Caching

- Flomiz enforces a burst limit of **300 requests per 60 seconds**.
- The server maintains an **in-memory cache with a 15-minute TTL**.
- If Flomiz is temporarily unreachable or the outbound IP is awaiting allowlist approval, the site smoothly falls back to local cached catalog data, ensuring 100% uptime for shoppers and dealers.
