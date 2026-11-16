# Hey Man Diamond LLC — Official Website & Wholesale Platform

[![Build & Tests](https://img.shields.io/badge/tests-224%20passing-brightgreen.svg)](tests/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](tsconfig.json)
[![React](https://img.shields.io/badge/React-19.3-61dafb.svg)](https://react.dev/)
[![Node](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-Proprietary-gold.svg)](#)

The official web platform and B2B wholesale management portal for **Hey Man Diamond LLC**, a premier supplier of certified lab-grown diamonds, fancy color solitaires, round melee, and matched pairs.

---

## 💎 Table of Contents

- [Overview & Architecture](#-overview--architecture)
- [Key Features](#-key-features)
  - [Customer Storefront](#customer-storefront)
  - [Trade Partner & Wholesale Portal](#trade-partner--wholesale-portal)
  - [Order Placement & Quote Negotiations](#order-placement--quote-negotiations)
  - [Admin Management Suite](#admin-management-suite)
- [Technology Stack](#-technology-stack)
- [Project Directory Layout](#-project-directory-layout)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Development & Build](#development--build)
- [Testing & Security](#-testing--security)
- [Deployment](#-deployment)
- [Company Information](#-company-information)

---

## 🏛 Overview & Architecture

The application employs a secure, server-mediated architecture designed for high performance, zero client-side credential leakage, and strict role-based access control (RBAC).

```
┌─────────────────────────────────┐
│     Client Browser (SPA)        │
│    React 19 + TypeScript        │
│  (Hash Routing, Luxury Theme)   │
└────────────────┬────────────────┘
                 │ HTTP / HTTPS (CORS + CSP Gated)
                 ▼
┌─────────────────────────────────┐
│       Node.js Backend API       │
│      (server/index.mjs)         │
│  - Static Asset Delivery        │
│  - Session & Rate Limiting      │
│  - Low-Level SMTP Mailer        │
│  - reCAPTCHA v2 Verification    │
└────────┬───────────────┬────────┘
         │               │
         │ REST API      │ REST / API Key
         ▼               ▼
┌─────────────────┐  ┌────────────────────────────────┐
│ Supabase Cloud  │  │ External Services:             │
│ - GoTrue Auth   │  │ - Flomiz Live Inventory API    │
│ - PostgREST DB  │  │ - Google reCAPTCHA v2          │
│ - PostgreSQL    │  │ - Instagram Graph Media Feed   │
└─────────────────┘  └────────────────────────────────┘
```

1. **Client SPA (React 19)**: Fast, single-page application built with Vite and TypeScript, featuring a bespoke luxury design system, interactive 360° diamond viewer, and smooth hash navigation (`/#home`, `/#diamonds`, `/#wholesale`, `/#signin`, `/#admin`).
2. **Backend Server (`server/index.mjs`)**: Lightweight, zero-dependency Node.js HTTP service. Serves compiled frontend assets, proxies authenticated REST requests to Supabase GoTrue and PostgREST, executes Google reCAPTCHA v2 verification, and dispatches automated order/inquiry emails to `sales@heymandiamond.com`.
3. **Database & RBAC**: Supabase PostgreSQL database with Row-Level Security (RLS) and custom roles:
   * **Guest / Retail Customer**: Accesses retail catalog pricing and public promotional discounts.
   * **Pending Wholesale Dealer**: Applied for B2B status; pending verification by staff.
   * **Approved Wholesale Dealer**: Unlocks exclusive Dealer Wholesale Rates with zero retail price interference.
   * **Staff & Administrators**: Granular operational roles (Super Administrator, Sales Manager, Operations Staff).

---

## ✨ Key Features

### Customer Storefront
* **Live Diamond Inventory**: Uncapped catalog with multi-facet filtering (Shape, Carat, Color, Clarity, Cut, Lab Certificate, Price).
* **High-Resolution 360° Video Viewer**: Native modal viewer for interactive 360° video inspection (Gem360 / V360) and certificate verification.
* **Direct Stone Inquiries**: Dedicated modal on every stone card allowing customers to ask questions or submit offers directly to sales specialists.
* **Social Sharing & Deep Linking**: Instant stone sharing via WhatsApp, SMS, Email, and native clipboard with automatic modal open on deep links (`?sku=...`).
* **Verified Customer Reviews**: Authenticated customer testimonial system with staff review moderation.

### Trade Partner & Wholesale Portal
* **Dealer Registration & KYC**: Trade partners submit company resale certificates and business details for verification.
* **Wholesale Price Isolation**: Approved dealers receive raw wholesale rates. Retail list prices, customer strikethrough prices, and retail promotional discounts are completely stripped server-side.

### Order Placement & Quote Negotiations
* **Shopping Cart & Concierge Checkout**: Customers and dealers can assemble orders, choose fulfillment options (*Direct Armored Courier* or *Diamond District Office Pick-Up*), and specify custom settings or delivery instructions.
* **Target-Price Bidding / Counter-Offers**: Supports custom offer price submissions per stone for sales manager review.
* **Automated Company Notifications**: Instant email dispatch to **`sales@heymandiamond.com`** with complete order specifications, customer contact, fulfillment preferences, itemized stone details, and `Reply-To` set to the customer.

### Admin Management Suite
* **Tabular Orders & Quotes View**: Comprehensive data table with search, status tabs (*All Orders*, *Pending Review*, *Price Approved*, *In Fulfillment*, *Completed*), and expandable fulfillment drawers.
* **Diamond Inquiries Management**: Real-time customer inquiry log with status toggles (*New*, *Responded*, *Closed*) and specialist reply dispatch.
* **Bulk Spreadsheet Upload**: High-performance Excel/CSV multi-stone upload engine with intelligent column mapping (`Wholesale Price (USD)`, `Dealer Rate`, `Discount %`), exact decimal preservation, and duplicate handling (overwrite vs. skip).
* **Staff Access Management**: Super Admin controls to invite staff members and assign granular permissions.

---

## 🛠 Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | React 19, TypeScript, Vite |
| **Styling & Design** | Pure CSS (Variables, Flexbox/Grid, Responsive Typography, BEM) |
| **Backend Runtime** | Node.js (native `node:http`, `node:tls`, `node:net`, `node:crypto`) |
| **Database & Auth** | Supabase (PostgreSQL, GoTrue Auth, PostgREST) |
| **Security & Anti-Bot** | Google reCAPTCHA v2, Strict CSP, Dynamic CORS, IP-aware Rate Limiting |
| **Testing** | Node.js native test runner (`node --test`), `node:assert/strict` |
| **External APIs** | Flomiz Diamond API, Instagram Basic Display / Graph API |

---

## 📁 Project Directory Layout

```
├── .env.example              # Environment variables template
├── index.html                # Application root template with reCAPTCHA script
├── package.json              # Project scripts and dependencies
├── server/
│   ├── index.mjs             # Main HTTP server & route multiplexer
│   └── services/
│       ├── auth.mjs          # Supabase GoTrue proxy, reCAPTCHA, and RBAC
│       ├── inventory.mjs     # Diamond inventory, spreadsheet parser, Flomiz sync
│       ├── mailer.mjs        # Low-level RFC 5322 SMTP notification client
│       ├── media.mjs         # Diamond media, placeholder SVGs, certificate links
│       ├── quotes.mjs        # Orders, custom quote negotiation, diamond inquiries
│       └── shared.mjs        # Database helpers, CSP headers, rate limiting
├── src/
│   ├── App.tsx               # Primary application shell & navigation controller
│   ├── AuthPages.tsx         # Sign-in, sign-up, user dashboard, admin portal
│   ├── DiamondCollection.tsx # Diamond catalog, filter bar, 360° modal, inquiry form
│   ├── diamondUtils.ts       # Pure utility functions & media resolvers
│   ├── routeUtils.ts         # Hash-based routing & token parser
│   └── ...                   # Supporting views (Reviews, PolicyPages, AboutPage)
├── public/                   # Static assets, category thumbnails, robots.txt, sitemap.xml
├── supabase/
│   └── migrations/           # Database schemas, RLS policies, staff permissions
└── tests/                    # 224 automated test suites (Auth, Pricing, Orders, Security)
```

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: `v18.0.0` or higher
* **npm**: `v9.0.0` or higher

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/kuldeepsingh343/heyman-diamond-website.git
cd heyman-diamond-website
npm install
```

### Environment Variables

Copy the example file to `.env`:

```bash
cp .env.example .env
```

Configure the following variables in `.env`:

```ini
# Client API Base URL (leave empty for same-origin)
VITE_API_BASE_URL=http://localhost:3000

# Supabase Project Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Google reCAPTCHA v2
VITE_RECAPTCHA_SITE_KEY=your-recaptcha-site-key
RECAPTCHA_SECRET_KEY=your-recaptcha-secret-key

# Flomiz Live Diamond API (Optional)
FLOMIZ_API_KEY=your-flomiz-api-key
FLOMIZ_BASE_URL=https://diamond.flomiz.com

# Production SMTP Dispatcher (Optional in dev; logs to console when omitted)
SMTP_HOST=mail.heymandiamond.com
SMTP_PORT=465
SMTP_USER=sales@heymandiamond.com
SMTP_PASS=your-smtp-password
SMTP_FROM=sales@heymandiamond.com
```

### Development & Build

```bash
# Run client dev server with Hot Module Replacement (HMR)
npm run dev

# Run backend API server
npm run start:api

# Compile production build (TypeScript check + Vite bundler)
npm run build

# Preview production build locally
npm run preview
```

---

## 🛡 Testing & Security

The project includes an automated test suite with **224 passing tests** across 3 test suites:

```bash
npm test
```

### Test Coverage Highlights
* **Adversarial Security & Hash Routing**: Validates hash fragment sanitization, ReDoS immunity under 100k-character inputs, XSS injection neutralization, and open-redirect prevention.
* **CORS & CSP Enforcement**: Verifies strict origin reflection, framing protections, and script allowlists.
* **Authoritative Pricing Engine**: Verifies that retail customers can never see wholesale/dealer pricing and that wholesale trade rates cannot be tampered with client-side.
* **Order & Inquiry Dispatch**: Validates order payload creation, itemized specs, line totals, and automatic email formatting.
* **Staff RBAC & Soft-Delete**: Enforces permission gates for order fulfillment, staff role management, and diamond restoration.

---

## 🚢 Deployment

The platform is configured for continuous deployment on [Render](https://render.com):

* **Service Type**: Web Service (Node.js)
* **Build Command**: `npm install && npm run build`
* **Start Command**: `node server/index.mjs`
* **Health Check Endpoint**: `/api/health`

---

## 🏢 Company Information

**Hey Man Diamond LLC**  
*Harvesting Dreams, Together*

* **Chicago Office**: Mallers Building, 5 S Wabash Ave, Suite 1704, Chicago, IL 60603, USA
* **New York Office**: 23 W 47th St, Suite 502, New York, NY 10063, USA
* **Inquiries & Sales**: [sales@heymandiamond.com](mailto:sales@heymandiamond.com)
* **Phone**: +1 312 646 0070
* **Website**: [https://heymandiamond.com](https://heymandiamond.com)

---
*© 2026 HEY MAN DIAMOND LLC. All Rights Reserved.*
