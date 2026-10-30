# Flomiz integration checklist

Never call Flomiz directly from the browser. Use a trusted server API so credentials and non-public fields remain private.

## Supplied endpoint
POST https://diamond.flomiz.com/FAccount/API/StockSummary/GetData_2.aspx

Example request for a stock page (CustomerId is a documentation placeholder, not a production value):
    {
      "CustomerId": "*",
      "PortalType": 1000,
      "ProductStockType": 3,
      "IsRemoveZeroStock": true,
      "IsShowRapaportPrice": false,
      "PhotoSize": 1,
      "PageContext": { "Page": 1, "PerPage": 30 }
    }

## Data boundary
- Flomiz is used only as a product/inventory data provider. Do not use it to fetch customer names, emails, accounts, orders, or other customer records.
- Website customer identity, sign-in, profiles, orders and quote requests are stored in the website's own authentication/database system.
- Require an authenticated website account before saving a quote or placing an order; derive customer identity from the verified server-side session, not customer fields submitted by the browser.
- Treat the documented CustomerId value "*" as an example only until Flomiz confirms the real authorized value.

## Before enabling the catalog
- Confirm credentials/auth method and authorized CustomerId/PortalType with Flomiz.
- Verify response success code and schema with a real request in a secure environment.
- Test pagination from response PageContext totals.
- Confirm which fields are allowed for public shoppers and approved dealers.
- Do not expose Rapaport pricing, internal stock quantities, supplier identifiers or internal notes by default.
- Normalize stable SKU, product/category, shape, carat, color, clarity, cut, polish, symmetry, lab/certificate and availability. Only expose price fields after retail/dealer pricing policy is approved and implemented server-side.
- Verify whether lstImages.base64FileByte contains usable image data; the example showed it empty.
- Set timeouts, bounded retries, rate limiting, caching and a clear stale-inventory state.
- Confirm reservation, order write-back, webhook or stock-locking support. If absent, use inquiry/quote or manual confirmation to avoid overselling.
- Recheck stock and price server-side immediately before order acceptance/payment.
- Redact credentials and customer data from logs.

## Suggested API contract
- GET /api/catalog: paginated, filtered list of safe fields.
- GET /api/catalog/:sku: safe detail for one SKU.
- POST /api/inquiries: customer request for quote or availability.
- POST /api/orders: server validates identity, permissions, current stock, price and promotion before creating an order.

Dealer authorization and price selection must be server-side, never based on hidden buttons or a role value submitted by React.
