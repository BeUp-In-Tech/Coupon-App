# Deal API Testing & Integration Guide

This guide covers both the V2 deal write endpoints (create/update with full pricing logic) and the location-based deal search endpoint. Use it for Postman testing and frontend integration.

---

## 1. Endpoints Reference

| Purpose | Method | Endpoint | Auth |
| --- | --- | --- | --- |
| Login | `POST` | `/api/v1/auth/login` | None |
| Get categories | `GET` | `/api/v1/category` | None |
| Create V2 deal | `POST` | `/api/v2/service` | Vendor |
| Update V2 deal | `PATCH` | `/api/v2/service/:dealId` | Vendor |
| List vendor's own deals | `GET` | `/api/v1/service/my_deals` | Vendor |
| Search deals by location | `GET` | `/api/v1/service/deals/location` | None |
| Legacy data migration | `GET` | `/api/v1/migrations/deals/pricing-redemption` | None |

Local base URL:

```text
http://localhost:3002
```

---

## 2. Prerequisites

1. Start MongoDB, Redis, and the API server.
2. Use an approved vendor account with an existing shop.
3. Have at least one valid category `_id`.
4. For location-limited deals, have at least one location `_id` belonging to the vendor's shop.
5. Have at least one deal image ready for multipart upload.

Get available categories:

```http
GET http://localhost:3002/api/v1/category
```

---

## 3. Authentication

```http
POST http://localhost:3002/api/v1/auth/login
Content-Type: application/json
```

```json
{
  "email": "vendor@example.com",
  "password": "Password@123"
}
```

Copy `data.accessToken` from the response and use it as:

```text
Authorization: Bearer <ACCESS_TOKEN>
```

---

## 4. Multipart Setup (Create & Update)

For `POST /api/v2/service` and `PATCH /api/v2/service/:dealId`:

1. In Postman: `Body → form-data`
2. Add `files` as type `File` — attach at least one image on create.
3. Add `data` as type `Text` — paste the JSON payload from this guide.
4. Optionally add `qr` or `upc` as type `File`.
5. Add the bearer token under `Authorization`.
6. Do **not** set `Content-Type` manually — the client adds the multipart boundary automatically.

| Field | Type | Required |
| --- | --- | --- |
| `files` | File | Required on create |
| `qr` | File | Optional coupon image |
| `upc` | File | Optional barcode image |
| `data` | Text (JSON) | Required |

---

## 5. Discount Types

### Overview

| `discount_type` | Required fields | UI rendering |
| --- | --- | --- |
| `PERCENT_OFF_PRICE` | `regular_price` (required, > 0), `discount` (1–100) | Show strike-through price + `{discount}% off` |
| `PERCENT_OFF_TOTAL` | `discount` (1–100) — `regular_price` must be omitted or `0` | Show `{discount}% off total bill` banner |
| `FIXED_PRICE` | `regular_price` (required, > 0) — `discount` is auto-set to `0`, do not send | Show fixed price, no discount badge |
| `NO_DISCOUNT` | `regular_price` (required, > 0) — `discount` is auto-set to `0`, do not send | Show regular price, no discount badge |
| `FREE` | `regular_price: 0` or omit — `discount` is auto-set to `0`, do not send | Show `Free`, hide all price/discount UI |
| `CUSTOM_DISCOUNT` | `regular_price` (required, > 0), `custom_discount` (non-empty text), `discount: 0` | Show only the custom text |
| `NO_PRICE` | Nothing — omit `regular_price` and `discount` entirely | Hide all price/discount UI; show deal info only |

### Validation rules enforced by the backend

| Rule | Error message |
| --- | --- |
| `discount` outside 1–100 for `PERCENT_OFF_PRICE` or `PERCENT_OFF_TOTAL` | `Percentage discount must be between 1 and 100` |
| `discount != 0` for `NO_DISCOUNT` | `Discount must be 0 when no discount is selected` |
| `regular_price != 0` or `discount != 0` for `FREE` | `Regular price and discount must both be 0 for a free deal` |
| `regular_price` provided (non-zero) for `PERCENT_OFF_TOTAL` | `Regular price is not required for percentage-off-total deals` |
| `custom_discount` empty or missing for `CUSTOM_DISCOUNT` | `custom_discount is required for custom discount deals` |
| `coupon_required: true` with no code, QR, or UPC | `At least one coupon code, QR, or UPC is required` |
| `coupon_required: false` but coupon/QR/UPC sent | `Coupon values are not allowed when coupon is not required` |
| `nationwide: false` with empty `available_in_location` | `At least one location is required when nationwide is false` |

---

## 6. Create Deal Tests (`POST /api/v2/service`)

### A. Percentage off listed price

```json
{
  "category": "<CATEGORY_ID>",
  "title": "Twenty Percent Off Listed Price",
  "regular_price": 100,
  "discount_type": "PERCENT_OFF_PRICE",
  "discount": 20,
  "coupon_required": true,
  "coupon": "PRICE20",
  "highlight": ["Twenty percent off"],
  "tags": ["discount"],
  "description": "Receive twenty percent off the listed price.",
  "nationwide": true,
  "available_in_location": []
}
```

Expected response fields:

```json
{
  "regular_price": 100,
  "discount_type": "PERCENT_OFF_PRICE",
  "discount": 20,
  "coupon_required": true
}
```

### B. Percentage off total bill

`regular_price` must be omitted or `0`. The discount applies to the entire transaction.

```json
{
  "category": "<CATEGORY_ID>",
  "title": "Fifteen Percent Off Total Bill",
  "discount_type": "PERCENT_OFF_TOTAL",
  "discount": 15,
  "coupon_required": false,
  "highlight": ["Applies to the total bill"],
  "tags": ["bill-discount"],
  "description": "Receive fifteen percent off the complete purchase bill.",
  "nationwide": true,
  "available_in_location": []
}
```

Do **not** attach `qr`, `upc`, or `coupon` here.

### C. Fixed price

```json
{
  "category": "<CATEGORY_ID>",
  "title": "Fixed Price Offer",
  "regular_price": 25,
  "discount_type": "FIXED_PRICE",
  "coupon_required": false,
  "highlight": ["Fixed price"],
  "tags": ["fixed-price"],
  "description": "This advertisement lists a fixed-price offer.",
  "nationwide": true,
  "available_in_location": []
}
```

### D. No discount

```json
{
  "category": "<CATEGORY_ID>",
  "title": "New Product Without Discount",
  "regular_price": 40,
  "discount_type": "NO_DISCOUNT",
  "coupon_required": false,
  "highlight": ["New product"],
  "tags": ["new"],
  "description": "This advertisement lists the product without a discount.",
  "nationwide": true,
  "available_in_location": []
}
```

### E. Free

```json
{
  "category": "<CATEGORY_ID>",
  "title": "Free Product Sample",
  "regular_price": 0,
  "discount_type": "FREE",
  "coupon_required": false,
  "highlight": ["Completely free"],
  "tags": ["free"],
  "description": "Claim a free product sample while supplies remain available.",
  "nationwide": true,
  "available_in_location": []
}
```

### F. Custom discount

```json
{
  "category": "<CATEGORY_ID>",
  "title": "Exclusive Member Offer",
  "regular_price": 100,
  "discount_type": "CUSTOM_DISCOUNT",
  "discount": 0,
  "custom_discount": "Exclusive member price: save $15 at checkout",
  "coupon_required": false,
  "highlight": ["Member exclusive"],
  "tags": ["custom"],
  "description": "A custom discount offer with a special member-only message.",
  "nationwide": true,
  "available_in_location": []
}
```

### G. Multiple coupon redemption methods

Keep `coupon_required: true`, include a coupon code, and also attach `qr` and `upc` image files in Postman.

```json
{
  "category": "<CATEGORY_ID>",
  "title": "Multiple Redemption Methods",
  "regular_price": 80,
  "discount_type": "PERCENT_OFF_PRICE",
  "discount": 25,
  "coupon_required": true,
  "coupon": "MULTI25",
  "highlight": ["Code, QR, or UPC"],
  "tags": ["multiple-redemption"],
  "description": "Redeem this deal using the coupon code, QR, or UPC.",
  "nationwide": true,
  "available_in_location": []
}
```

Save the returned `data._id` as `<DEAL_ID>` for update testing.

### H. No price deal

Vendor posts a deal with no price information — no `regular_price` or `discount` needed.

```json
{
  "category": "<CATEGORY_ID>",
  "title": "Community Event Announcement",
  "discount_type": "NO_PRICE",
  "coupon_required": false,
  "highlight": ["No purchase required"],
  "tags": ["event", "free-entry"],
  "description": "Join us for our community event. No price or discount applies.",
  "nationwide": true,
  "available_in_location": []
}
```

```json
{
  "category": "<CATEGORY_ID>",
  "title": "Savar Branch Special Offer",
  "regular_price": 60,
  "discount_type": "PERCENT_OFF_PRICE",
  "discount": 10,
  "coupon_required": false,
  "highlight": ["Savar only"],
  "tags": ["local"],
  "description": "This offer is available only at our Savar branch.",
  "nationwide": false,
  "available_in_location": ["<LOCATION_ID>"]
}
```

`available_in_location` must contain at least one valid Location `_id` from the vendor's shop when `nationwide` is `false`.

---

## 7. Update Deal Tests (`PATCH /api/v2/service/:dealId`)

Send only the fields you want to change. Images are optional during updates.

```http
PATCH http://localhost:3002/api/v2/service/<DEAL_ID>
Authorization: Bearer <ACCESS_TOKEN>
```

### Change to percentage off total

```json
{
  "discount_type": "PERCENT_OFF_TOTAL",
  "discount": 15
}
```

Note: `regular_price` is automatically cleared by the backend for this type.

### Change to fixed price

```json
{
  "regular_price": 30,
  "discount_type": "FIXED_PRICE",
  "discount": 0
}
```

### Change to no discount

```json
{
  "discount_type": "NO_DISCOUNT"
}
```

### Change to free

```json
{
  "regular_price": 0,
  "discount_type": "FREE"
}
```

### Change to custom discount

```json
{
  "discount_type": "CUSTOM_DISCOUNT",
  "custom_discount": "Member-only offer"
}
```

### Remove coupon requirement

```json
{
  "coupon_required": false
}
```

Side effects on the backend:
- `coupon_required` becomes `false`
- Stored coupon code is cleared
- Stored QR and UPC values are cleared
- Old redemption assets are queued for deletion from storage

---

## 8. Location-Based Deal Search (`GET /api/v1/service/deals/location`)

This endpoint supports two modes controlled by the `locationMode` query parameter.

### Mode 1: Current Location (GPS coordinates)

The frontend sends the user's live GPS coordinates. The backend returns all promoted deals whose vendor location falls within the requested radius.

```http
GET http://localhost:3002/api/v1/service/deals/location
  ?locationMode=CURRENT_LOCATION
  &lat=23.8103
  &lng=90.4125
  &radiusKm=25
  &page=1
  &limit=20
```

| Parameter | Type | Required | Default | Range | Description |
| --- | --- | --- | --- | --- | --- |
| `locationMode` | string | Yes | — | `CURRENT_LOCATION` | Mode selector |
| `lat` | number | Yes | — | -90 to 90 | User latitude |
| `lng` | number | Yes | — | -180 to 180 | User longitude |
| `radiusKm` | number | No | `25` | 1–100 | Search radius in kilometres |
| `page` | integer | No | `1` | ≥ 1 | Page number |
| `limit` | integer | No | `20` | 1–100 | Results per page |

**Response shape:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Deals fetched by location",
  "data": {
    "meta": {
      "locationMode": "CURRENT_LOCATION",
      "locationLabel": "Current location",
      "radiusKm": 25,
      "page": 1,
      "limit": 20,
      "total": 12,
      "totalPages": 1
    },
    "deals": [ ... ],
    "links": {
      "self": "https://api.example.com/api/v1/service/deals/location?locationMode=CURRENT_LOCATION&lat=23.81&lng=90.41&radiusKm=25&page=1"
    }
  }
}
```

---

### Mode 2: Selected Location (city/state/country)

The frontend sends a city name selected by the user. The backend applies a **three-stage fallback** to always return useful results.

```http
GET http://localhost:3002/api/v1/service/deals/location
  ?locationMode=SELECTED_LOCATION
  &city=Narayanganj
  &state=Dhaka+Division
  &country=Bangladesh
  &page=1
  &limit=20
```

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `locationMode` | string | Yes | Must be `SELECTED_LOCATION` |
| `country` | string | Yes | Must not be empty |
| `city` | string | No* | At least one of city/state/zip_code required |
| `state` | string | No* | |
| `zip_code` | string | No* | |
| `page` | integer | No | Default `1` |
| `limit` | integer | No | Default `20`, max `100` |

#### Fallback pipeline (3 stages)

```
Stage 1 — Exact match
  Find Location docs matching the provided city/state/country exactly.
  If deals exist for those locations → return them. Done.
        │
        │ (zero deals in the city OR city not in Location collection)
        ▼
Stage 2 — 200-mile radius fallback
  Find all Location docs within 200 miles (321,869 m) of the city centroid.
  Return deals from those nearby cities.
  meta.fallbackUsed = true
  meta.fallbackReason = "NO_DEALS_IN_EXACT_LOCATION"
        │
        │ (no Location docs exist for the country/state at all)
        ▼
Stage 3 — Nationwide only
  Return only nationwide deals (nationwide: true).
  meta.fallbackUsed = true
  meta.fallbackReason = "NO_LOCATIONS_IN_REGION"
```

**Nationwide deals (nationwide: true) are always appended** to every result set regardless of which stage fires.

**Response shape — exact match:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Deals fetched by location",
  "data": {
    "meta": {
      "locationMode": "SELECTED_LOCATION",
      "locationLabel": "Narayanganj, Dhaka Division, Bangladesh",
      "page": 1,
      "limit": 20,
      "total": 8,
      "totalPages": 1,
      "fallbackUsed": false,
      "fallbackReason": null
    },
    "deals": [ ... ],
    "links": {
      "self": "https://api.example.com/api/v1/service/deals/location?locationMode=SELECTED_LOCATION&city=Narayanganj&state=Dhaka+Division&country=Bangladesh&page=1"
    }
  }
}
```

**Response shape — 200-mile radius fallback triggered:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Deals fetched by location",
  "data": {
    "meta": {
      "locationMode": "SELECTED_LOCATION",
      "locationLabel": "Narayanganj, Dhaka Division, Bangladesh",
      "page": 1,
      "limit": 20,
      "total": 5,
      "totalPages": 1,
      "fallbackUsed": true,
      "fallbackReason": "NO_DEALS_IN_EXACT_LOCATION"
    },
    "deals": [ ... ],
    "links": {
      "self": "..."
    }
  }
}
```

#### Frontend integration tips

- Always read `meta.fallbackUsed` — when `true`, show a soft message such as:
  `"No deals found in Narayanganj. Showing results from nearby cities."`
- Use `meta.fallbackReason` to distinguish between the two fallback states:
  - `"NO_DEALS_IN_EXACT_LOCATION"` — city exists but has no deals, showing 200-mile radius results
  - `"NO_LOCATIONS_IN_REGION"` — no location data for this region, showing nationwide deals only
- `meta.locationLabel` is pre-formatted for display (e.g. `"Narayanganj, Dhaka Division, Bangladesh"`).
- Use `links.next` / `links.prev` for pagination — they preserve all original query params.
- When `links.next` is absent, the user is on the last page. When `links.prev` is absent, they are on the first page.

#### HATEOAS pagination links

Every response includes a `links` object:

| Key | Present when | Value |
| --- | --- | --- |
| `links.self` | Always | Current request URL |
| `links.next` | `meta.page < meta.totalPages` | URL with `page` incremented by 1 |
| `links.prev` | `meta.page > 1` | URL with `page` decremented by 1 |

Example with multiple pages:

```json
"links": {
  "self":  "https://api.example.com/...&page=2",
  "next":  "https://api.example.com/...&page=3",
  "prev":  "https://api.example.com/...&page=1"
}
```

---

## 9. Deal Object Fields

Each deal in the `deals` array contains:

| Field | Type | Description |
| --- | --- | --- |
| `_id` | string | Deal ID |
| `title` | string | Deal title |
| `regular_price` | number | Listed price (0 for FREE / PERCENT_OFF_TOTAL) |
| `discount` | number | Percentage value (0 when not applicable) |
| `discount_type` | string | One of the six discount type values |
| `custom_discount` | string | Custom text (only present for `CUSTOM_DISCOUNT`) |
| `coupon_required` | boolean | Whether a coupon must be redeemed |
| `nationwide` | boolean | `true` = available everywhere |
| `isPromoted` | boolean | Must be `true` to appear in search |
| `promotedUntil` | ISO date | Promotion expiry |
| `images` | string[] | First image URL included in list responses |
| `nearest_location` | ObjectId | ID of the matched/nearest Location doc |
| `matched_location` | object | `{ _id, location_name, address }` of the matched location |
| `shop` | object | `{ _id, business_name, business_logo }` |

---

## 10. Validation Error Tests (Expected 400)

Each payload below should return HTTP 400. Merge the shown fields into a complete valid create payload.

### Invalid percentage value

```json
{ "discount_type": "PERCENT_OFF_PRICE", "discount": 101 }
```
Expected: `Percentage discount must be between 1 and 100`

### Non-zero discount on NO_DISCOUNT

```json
{ "discount_type": "NO_DISCOUNT", "discount": 10 }
```
Expected: `Discount must be 0 when no discount is selected`

### Non-zero price on FREE deal

```json
{ "regular_price": 20, "discount_type": "FREE", "discount": 0 }
```
Expected: `Regular price and discount must both be 0 for a free deal`

### Regular price on PERCENT_OFF_TOTAL

```json
{ "discount_type": "PERCENT_OFF_TOTAL", "regular_price": 100, "discount": 15 }
```
Expected: `Regular price is not required for percentage-off-total deals`

### CUSTOM_DISCOUNT without text

```json
{ "discount_type": "CUSTOM_DISCOUNT", "discount": 0 }
```
Expected: `custom_discount is required for custom discount deals`

### Coupon required but no method provided

```json
{ "coupon_required": true }
```
Expected: `At least one coupon code, QR, or UPC is required`

### Coupon sent when not required

```json
{ "coupon_required": false, "coupon": "SHOULD-NOT-BE-SENT" }
```
Expected: `Coupon values are not allowed when coupon is not required`

### Local deal without location

```json
{ "nationwide": false, "available_in_location": [] }
```
Expected: `At least one location is required when nationwide is false`

### SELECTED_LOCATION without country

```http
GET /api/v1/service/deals/location?locationMode=SELECTED_LOCATION&city=Dhaka
```
Expected: HTTP 400 — `Required` (country is missing)

### SELECTED_LOCATION with country only

```http
GET /api/v1/service/deals/location?locationMode=SELECTED_LOCATION&country=Bangladesh
```
Expected: HTTP 400 — `At least one of city, state, or zip_code is required with country`

---

## 11. Windows curl Example

```powershell
curl.exe -X POST "http://localhost:3002/api/v2/service" `
  -H "Authorization: Bearer <ACCESS_TOKEN>" `
  -F "files=@C:\path\deal.jpg" `
  -F 'data={"category":"<CATEGORY_ID>","title":"Free Product Sample","regular_price":0,"discount_type":"FREE","discount":0,"coupon_required":false,"highlight":["Completely free"],"tags":["free"],"description":"Claim a free product sample while supplies remain available.","nationwide":true,"available_in_location":[]}'
```

---

## 12. Verify Stored Values

```http
GET http://localhost:3002/api/v1/service/my_deals
Authorization: Bearer <ACCESS_TOKEN>
```

Confirm each tested deal returns the expected pricing fields.

---

## 13. Completion Checklist

- [ ] All six V2 discount types create successfully
- [ ] Coupon code, QR, UPC, and multi-method redemption work
- [ ] `coupon_required: false` deals create without a coupon
- [ ] All validation errors in section 10 return HTTP 400 with the correct message
- [ ] V2 update clears incompatible pricing fields automatically
- [ ] V2 update clears coupon values when `coupon_required` becomes `false`
- [ ] Location search with `CURRENT_LOCATION` returns deals within the requested radius
- [ ] Location search with `SELECTED_LOCATION` returns deals for the exact city when available
- [ ] 200-mile radius fallback fires when selected city has no deals — `meta.fallbackUsed: true`
- [ ] Nationwide deals appear in every location search result
- [ ] `links.next` and `links.prev` are correct and absent on single-page results
- [ ] V1 create and read endpoints still work unchanged
- [ ] Migration endpoint can be called twice without re-migrating already-migrated records
