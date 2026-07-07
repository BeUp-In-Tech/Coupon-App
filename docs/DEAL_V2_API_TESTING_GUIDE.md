# Deal V2 API Testing Guide

This guide tests the versioned deal pricing and coupon-redemption API without
removing or replacing the existing V1 write endpoints.

## 1. Endpoints

| Purpose | Method | Endpoint |
| --- | --- | --- |
| Login | `POST` | `/api/v1/auth/login` |
| Get categories | `GET` | `/api/v1/category` |
| Create V2 deal | `POST` | `/api/v2/service` |
| Update V2 deal | `PATCH` | `/api/v2/service/:dealId` |
| List vendor deals | `GET` | `/api/v1/service/my_deals` |
| Legacy data migration | `GET` | `/api/v1/migrations/deals/pricing-redemption` |

Local base URL:

```text
http://localhost:3002
```

## 2. Prerequisites

Before testing:

1. Start MongoDB, Redis, the API server, and any required upload service.
2. Use an approved vendor account with an existing shop.
3. Have at least one valid category ID.
4. For a location-limited deal, have at least one location ID belonging to the
   vendor's shop.
5. Have a deal image available for multipart upload.

Get available categories:

```http
GET http://localhost:3002/api/v1/category
```

## 3. Login and Copy the Access Token

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

Copy `data.accessToken` from the response. Use it for every protected request:

```text
Authorization: Bearer <ACCESS_TOKEN>
```

## 4. Optional Legacy Migration

> Warning: this endpoint updates existing deal records. Run it only against the
> environment you intend to migrate.

```http
GET http://localhost:3002/api/v1/migrations/deals/pricing-redemption
```

The migration:

- Converts positive existing discounts to `PERCENT_OFF_PRICE`.
- Converts zero-discount paid deals to `NO_DISCOUNT`.
- Converts zero-price, zero-discount deals to `FREE`.
- Sets `coupon_required` according to existing coupon, QR, or UPC data.
- Can be safely called again; already migrated records are not changed.

Expected response data:

```json
{
  "deals_matched": 10,
  "deals_updated": 10
}
```

## 5. Postman Multipart Setup

For `POST /api/v2/service`:

1. Select **Body → form-data**.
2. Add `files` as type **File** and select at least one deal image.
3. Add `data` as type **Text** and paste one JSON payload from this guide.
4. Optionally add `qr` or `upc` as type **File**.
5. Add the bearer token under **Authorization**.
6. Do not manually set `Content-Type`; Postman adds the multipart boundary.

Multipart field names:

| Field | Type | Requirement |
| --- | --- | --- |
| `files` | File | At least one on create |
| `qr` | File | Optional coupon method |
| `upc` | File | Optional coupon method |
| `data` | Text containing JSON | Required |

Replace these placeholders before sending:

```text
<CATEGORY_ID>
<LOCATION_ID>
```

The examples use `nationwide: true`, so `available_in_location` may be empty.
For a local-only deal, set `nationwide: false` and provide at least one valid
location ID.

## 6. Discount Type Meaning and Frontend Inputs

| Dropdown label | API value | Inputs to show | Example |
| --- | --- | --- | --- |
| % Discount Off Price | `PERCENT_OFF_PRICE` | Regular price and discount percentage | Price `$100`, discount `20` → discounted price `$80` |
| % Discount Off Total Bill | `PERCENT_OFF_TOTAL` | Regular price and discount percentage | Bill `$200`, discount `15` → customer pays `$170` |
| Dollar Amount Off Purchase | `AMOUNT_OFF_PURCHASE` | Regular price, amount off, and minimum purchase | `$10` off a purchase of `$75` or more |
| No Discount | `NO_DISCOUNT` | Regular price only | Price `$40`, customer pays `$40` |
| Free | `FREE` | No editable price or discount input | Regular price `0`, customer pays `$0` |
| Custom Discount | `CUSTOM_DISCOUNT` | Custom discount description text | Use custom discount messaging such as "Buy one, get one free" or "Exclusive member offer" |

### `PERCENT_OFF_PRICE`

Use this when the discount applies directly to the advertised item's listed
price.

```text
regular_price = 100
discount = 20%
displayed discounted price = 100 - (100 × 20 / 100) = 80
```

Required API values:

```json
{
  "regular_price": 100,
  "discount_type": "PERCENT_OFF_PRICE",
  "discount": 20
}
```

### `PERCENT_OFF_TOTAL`

Use this when the percentage applies to the customer's final bill rather than
one item's listed price.

```text
total bill = 200
discount = 15%
amount saved = 200 × 15 / 100 = 30
customer pays = 170
```

The frontend should display text such as **15% off the total bill**. The actual
bill calculation normally happens at the merchant during redemption.

```json
{
  "regular_price": 100,
  "discount_type": "PERCENT_OFF_TOTAL",
  "discount": 15
}
```

### `AMOUNT_OFF_PURCHASE`

Use this for a fixed monetary discount that activates after the customer meets
the minimum purchase.

```text
discount = $10
minimum purchase = $75
$80 qualifying purchase - $10 discount = $70
$60 purchase does not qualify
```

```json
{
  "regular_price": 75,
  "discount_type": "AMOUNT_OFF_PURCHASE",
  "discount": 10,
  "minimum_purchase": 75
}
```

`minimum_purchase` must be greater than `0` and cannot be less than `discount`.

### `NO_DISCOUNT`

Use this for an advertisement that lists a product or service without reducing
its price.

```json
{
  "regular_price": 40,
  "discount_type": "NO_DISCOUNT",
  "discount": 0
}
```

The frontend should hide or disable the discount-value input.

### `FREE`

Use this when the advertised product or service is completely free.

```json
{
  "regular_price": 0,
  "discount_type": "FREE",
  "discount": 0
}
```

The frontend should display **Free** instead of `$0` and hide or disable price
and discount inputs.

### `CUSTOM_DISCOUNT`

Use this when the promotion requires custom text or messaging and does not fit
standard percentage or fixed amount discount rules.

```json
{
  "regular_price": 100,
  "discount_type": "CUSTOM_DISCOUNT",
  "discount": 0,
  "custom_discount": "Exclusive member price: save $15 at checkout"
}
```

The frontend should display the `custom_discount` text as the deal description
or badge instead of a calculated percentage or fixed discount amount.

## 7. Create Tests

### A. Percentage Off Listed Price

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

Expected pricing fields:

```json
{
  "regular_price": 100,
  "discount_type": "PERCENT_OFF_PRICE",
  "discount": 20,
  "coupon_required": true
}
```

### B. Percentage Off Total Bill Without Coupon

```json
{
  "category": "<CATEGORY_ID>",
  "title": "Fifteen Percent Off Total Bill",
  "regular_price": 100,
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

Do not attach `qr` or `upc`, and do not send `coupon` for this test.

### C. Amount Off With Minimum Purchase

```json
{
  "category": "<CATEGORY_ID>",
  "title": "Ten Dollars Off Seventy Five",
  "regular_price": 75,
  "discount_type": "AMOUNT_OFF_PURCHASE",
  "discount": 10,
  "minimum_purchase": 75,
  "coupon_required": false,
  "highlight": ["Minimum purchase applies"],
  "tags": ["amount-off"],
  "description": "Receive ten dollars off a purchase of seventy-five or more.",
  "nationwide": true,
  "available_in_location": []
}
```

### D. No Discount

```json
{
  "category": "<CATEGORY_ID>",
  "title": "New Product Without Discount",
  "regular_price": 40,
  "discount_type": "NO_DISCOUNT",
  "discount": 0,
  "coupon_required": false,
  "highlight": ["New product"],
  "tags": ["new"],
  "description": "This advertisement lists the product without a discount.",
  "nationwide": true,
  "available_in_location": []
}
```

### E. Free Deal

```json
{
  "category": "<CATEGORY_ID>",
  "title": "Free Product Sample",
  "regular_price": 0,
  "discount_type": "FREE",
  "discount": 0,
  "coupon_required": false,
  "highlight": ["Completely free"],
  "tags": ["free"],
  "description": "Claim a free product sample while supplies remain available.",
  "nationwide": true,
  "available_in_location": []
}
```

### F. Custom Discount Deal

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

### G. Multiple Coupon Methods

Use the percentage-off-price payload, keep `coupon_required: true`, include a
coupon code, and attach both `qr` and `upc` files in Postman.

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

## 8. Update Tests

Updates are also multipart requests. In Postman, add a `data` text field with
the partial JSON. Deal images are optional during updates.

### Change to an Amount-Off Deal

```http
PATCH http://localhost:3002/api/v2/service/<DEAL_ID>
Authorization: Bearer <ACCESS_TOKEN>
```

```json
{
  "regular_price": 100,
  "discount_type": "AMOUNT_OFF_PURCHASE",
  "discount": 20,
  "minimum_purchase": 100
}
```

### Change to No Discount

This must remove the amount-only `minimum_purchase` value:

```json
{
  "discount_type": "NO_DISCOUNT",
  "discount": 0
}
```

### Change to Free

```json
{
  "regular_price": 0,
  "discount_type": "FREE",
  "discount": 0
}
```

### Remove Coupon Requirement

```json
{
  "coupon_required": false
}
```

Expected result:

- `coupon_required` becomes `false`.
- Existing `coupon` is removed.
- Existing QR and UPC values are removed.
- Old QR and UPC assets are queued for deletion.

## 9. Verify Stored and Returned Values

List the vendor's deals:

```http
GET http://localhost:3002/api/v1/service/my_deals
Authorization: Bearer <ACCESS_TOKEN>
```

Verify each tested deal returns:

```json
{
  "regular_price": 75,
  "discount": 10,
  "discount_type": "AMOUNT_OFF_PURCHASE",
  "minimum_purchase": 75,
  "coupon_required": false
}
```

`minimum_purchase` should only exist for `AMOUNT_OFF_PURCHASE`.

## 10. Required `400 Bad Request` Tests

Each request below should return a validation error instead of creating a deal.
For create tests, merge the shown fields into any complete valid create payload
from section 7.

Expected status:

```http
HTTP/1.1 400 Bad Request
```

### Invalid Percentage

```json
{
  "discount_type": "PERCENT_OFF_PRICE",
  "discount": 101
}
```

Expected error:

```text
Percentage discount must be between 1 and 100
```

### Missing Minimum Purchase

```json
{
  "discount_type": "AMOUNT_OFF_PURCHASE",
  "discount": 10
}
```

Expected error:

```text
Minimum purchase is required and must be greater than 0
```

### Minimum Purchase Below Discount

```json
{
  "discount_type": "AMOUNT_OFF_PURCHASE",
  "discount": 50,
  "minimum_purchase": 25
}
```

Expected error:

```text
Minimum purchase cannot be less than the discount amount
```

### Invalid No-Discount Value

```json
{
  "discount_type": "NO_DISCOUNT",
  "discount": 10
}
```

Expected error:

```text
Discount must be 0 when no discount is selected
```

### Invalid Free Price

```json
{
  "regular_price": 20,
  "discount_type": "FREE",
  "discount": 0
}
```

Expected error:

```text
Regular price and discount must both be 0 for a free deal
```

### Coupon Required Without a Method

```json
{
  "coupon_required": true
}
```

Expected error:

```text
At least one coupon code, QR, or UPC is required
```

### Coupon Sent While Not Required

```json
{
  "coupon_required": false,
  "coupon": "SHOULD-NOT-BE-SENT"
}
```

Expected error:

```text
Coupon values are not allowed when coupon is not required
```

### Local Deal Without a Location

```json
{
  "nationwide": false,
  "available_in_location": []
}
```

Expected error:

```text
At least one location is required when nationwide is false
```

The messages above are the expected create-validation messages. Pricing and
location failures can also be tested with partial update payloads, although the
update service may return a combined pricing message. On update,
`coupon_required: false` intentionally clears submitted and stored coupon
values instead of returning an error. Coupon-required update testing must use a
deal that currently has no stored coupon, QR, or UPC.

## 11. Windows `curl.exe` Example

PowerShell aliases `curl` on some systems, so use `curl.exe` explicitly:

```powershell
curl.exe -X POST "http://localhost:3002/api/v2/service" `
  -H "Authorization: Bearer <ACCESS_TOKEN>" `
  -F "files=@C:\path\deal.jpg" `
  -F 'data={"category":"<CATEGORY_ID>","title":"Free Product Sample","regular_price":0,"discount_type":"FREE","discount":0,"coupon_required":false,"highlight":["Completely free"],"tags":["free"],"description":"Claim a free product sample while supplies remain available.","nationwide":true,"available_in_location":[]}'
```

## 12. Completion Checklist

- [ ] V1 create endpoint still works.
- [ ] V1 update endpoint still works.
- [ ] All five V2 discount types create successfully.
- [ ] Coupon code, QR, UPC, and multiple-method redemption work.
- [ ] A deal can be created with `coupon_required: false`.
- [ ] Invalid conditional values are rejected.
- [ ] V2 update clears incompatible pricing fields.
- [ ] V2 update clears coupon values when redemption is not required.
- [ ] V1 read APIs return the new pricing, coupon, and `custom_discount` fields.
- [ ] V2 create/update supports `CUSTOM_DISCOUNT` and requires `custom_discount` text for that type.
- [ ] Migration can be called twice without changing migrated records again.
