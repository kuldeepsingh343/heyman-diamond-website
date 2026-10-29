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
      "IsShowRapaportPrice": true,
      "PhotoSize": 1,
      "PageContext": { "Page": 1, "PerPage": 30 }
    }

## Before enabling the catalog
- Confirm credentials/auth method and authorized CustomerId/PortalType with Flomiz.
- Verify response success code and schema with a real request in a secure environment.
- Test pagination from response PageContext totals.
- Confirm which fields are allowed for public shoppers and approved dealers.
- Do not expose Rapaport pricing, internal stock quantities, supplier identifiers or internal notes by default.
- Normalize stable SKU, shape, carat, color, clarity, cut, polish, symmetry, lab/certificate, availability and approved price.
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
