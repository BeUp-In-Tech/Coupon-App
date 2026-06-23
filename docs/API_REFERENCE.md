# Yepp Ads API Reference

Base prefix: `/api/v1` unless noted.

## Request Conventions

- Protected routes require `Authorization: Bearer <accessToken>`.
- JSON endpoints use `Content-Type: application/json`.
- File upload endpoints use `multipart/form-data`.
- For selected multipart routes, structured payload is sent in a `data` form field as a JSON string.
- Coordinates are stored as `[lng, lat]`.

Common list query parameters:

- `searchTerm`
- `sort`, for example `-createdAt`
- `page`
- `limit`
- `fields`, as a comma-separated list
- `join`, using `path-field1|field2,path2-field3|field4`

## System

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | Public | Health/welcome route |
| POST | `/webhook` | Stripe signature | Stripe webhook listener |

## Auth Module (`/auth`)

| Method | Endpoint | Auth | Request |
| --- | --- | --- | --- |
| POST | `/auth/login` | Public | `{ "email", "password" }` |
| POST | `/auth/change_password` | Logged user | `{ "oldPassword", "newPassword" }` |
| GET | `/auth/forget_password/:email` | Public | Path param `email` |
| POST | `/auth/verify_otp` | Public | `{ "email", "otp" }` |
| POST | `/auth/reset_password` | Public | Header `token`, body `{ "newPassword" }` |
| POST | `/auth/generate_token` | Public | `{ "refreshToken" }` |
| GET | `/auth/google` | Public | Optional query `redirectTo` |
| GET | `/auth/google/callback` | Public | Google callback handler |
| POST | `/auth/google/auth` | Public | `{ "id_token", "access_token?" }` |
| POST | `/auth/apple` | Public | `{ "code", "user_name?", "email?" }` |
| POST | `/auth/apple/callback` | Public | Apple callback payload |

Notes:

- `/auth/google/callback` redirects to the configured frontend or deep link with tokens in the query string.
- `/auth/google/auth` and `/auth/apple` support mobile-friendly non-redirect authentication.

## User Module (`/user`)

| Method | Endpoint | Auth | Request |
| --- | --- | --- | --- |
| POST | `/user/register` | Public | `{ "user_name", "email", "password?" }` |
| PATCH | `/user/` | Logged user | `{ "user_name" }` |
| GET | `/user/get_me` | Logged user | None |
| POST | `/user/verification_otp` | Public | `{ "email" }` |
| POST | `/user/verify_profile` | Public | `{ "email", "otp" }` |
| DELETE | `/user/delete_account` | Logged user | None |
| POST | `/user/register_fcm` | Logged user | `{ "token", "platform", "deviceId", "deviceName?" }` |
| PATCH | `/user/unregister_fcm` | Logged user | `{ "deviceId" }` |
| GET | `/user/get_device` | Logged user | None |

Validation notes:

- `platform` must be one of `WEB`, `IOS`, or `ANDROID`.
- Passwords require an uppercase letter, number, and special character.

## Shop Module (`/shop`)

| Method | Endpoint | Auth | Request |
| --- | --- | --- | --- |
| POST | `/shop/create_shop` | `VENDOR` | Multipart: `file` plus `data` JSON |
| GET | `/shop/shop_details` | Public | Query: `shopId` or `myId` |
| PATCH | `/shop/update_shop/:shopId` | `VENDOR` or `ADMIN` | Multipart optional `file` plus update fields |
| GET | `/shop/analytics` | `VENDOR` | None |
| GET | `/shop/yearly_analytics` | `VENDOR` | None |

Create shop `data` example:

```json
{
  "shop": {
    "business_name": "Coffee Lab",
    "business_email": "hello@coffeelab.com",
    "business_phone": {
      "country_code": "+1",
      "phone_number": "1234567890"
    },
    "description": "Specialty coffee and bakery.",
    "website": "https://coffeelab.com"
  },
  "outlet": [
    {
      "outlet_name": "Main Branch",
      "address": "123 Main St",
      "zip_code": "10001",
      "coordinates": [90.4125, 23.8103]
    }
  ]
}
```

## Category Module (`/category`)

| Method | Endpoint | Auth | Request |
| --- | --- | --- | --- |
| POST | `/category/` | `ADMIN` | Multipart: `file` plus `category_name` |
| GET | `/category/` | Public | Query: `delete=true` or `delete=false` |
| PATCH | `/category/:categoryId` | `ADMIN` | Multipart optional `file`; optional `category_name`, `isDeleted` |
| DELETE | `/category/:categoryId` | `ADMIN` | None |

## Location Module (`/locations`)

| Method | Endpoint | Auth | Request |
| --- | --- | --- | --- |
| POST | `/locations/` | `VENDOR` | Single location JSON payload |
| PATCH | `/locations/?l_id=<id>` | Logged user with shop ownership | Partial location JSON payload |
| GET | `/locations/bulk/template` | `VENDOR` | Download the XLSX upload template |
| POST | `/locations/bulk/preview` | `VENDOR` | Multipart `file`: `.xlsx` or `.csv`, maximum 10 MB / 5,000 rows |
| POST | `/locations/bulk/:batchId/confirm` | `VENDOR` | Import valid rows from a previewed batch |

`coordinates` must be `[lng, lat]`.

Bulk location headers are `Location name`, `Street`, `Zip code`, `City`,
`State`, `Country`, `Longitude`, `Latitude`, and `Is active`. Preview validates
without inserting; the backend maps these labels to the location model and a
batch remains confirmable for 30 minutes.

## Deal Module (`/service`)

| Method | Endpoint | Auth | Request |
| --- | --- | --- | --- |
| POST | `/service/` | `VENDOR` | Multipart: `files[]`, `qr?`, `upc?`, `data` JSON |
| GET | `/service/deals/all_deals/:lng/:lat` | Public | Query: `searchTerm?`, `page?`, `limit?` |
| GET | `/service/deals/analytic/:dealId` | `VENDOR` | Path param `dealId` |
| GET | `/service/deals/:lng/:lat` | Public | Query: `page?`, `limit?` |
| GET | `/service/my_deals` | `VENDOR` | QueryBuilder params plus `deal_filter` |
| GET | `/service/saved` | Public | Query: `ids=id1,id2,...` plus paging |
| GET | `/service/:dealId/:lng/:lat` | Public | Path params required |
| GET | `/service/c/:categoryId` | Public | Query: `lat`, `lng`, `page?`, `limit?`, `sort?` |
| DELETE | `/service/:dealId` | `VENDOR` | None |
| PATCH | `/service/:dealId` | `VENDOR` | Multipart update payload |
| GET | `/service/top_viewed_deals` | `VENDOR` | Query: `page?`, `limit?` |

Supported `deal_filter` values:

- `promoted`
- `expired`
- `new`

Create deal `data` example:

```json
{
  "category": "6800d0b0f9f4e50bc1a11111",
  "title": "50% Off Pasta",
  "reguler_price": 20,
  "discount": 50,
  "highlight": ["Dine in", "Dinner"],
  "tags": ["italian", "pasta"],
  "description": "Valid for all pasta items.",
  "coupon": "PASTA50",
  "available_in_location": ["6800d0b0f9f4e50bc1a22222"]
}
```

Media constraints:

- `qr` image must be exactly `500x500`.
- `upc` image must be exactly `800x400`.
- `files` upload limit is 10.

## Plan Module (`/plan`)

| Method | Endpoint | Auth | Request |
| --- | --- | --- | --- |
| POST | `/plan/` | `ADMIN` | Multipart: `file` plus `{ title, short_desc, price, currency?, durationDays }` |
| GET | `/plan/` | Public | None |
| PATCH | `/plan/:planId` | `ADMIN` | Multipart optional `file`, partial body |
| DELETE | `/plan/:planId` | `ADMIN` | None |

## Voucher Module (`/voucher`)

| Method | Endpoint | Auth | Request |
| --- | --- | --- | --- |
| POST | `/voucher/` | `ADMIN` | `{ voucher_code, voucher_discount, voucher_validity, voucher_limit }` |
| GET | `/voucher/` | `ADMIN` | None |
| GET | `/voucher/apply_voucher` | Logged user | Query: `voucher_code` |
| GET | `/voucher/:voucherId` | `ADMIN` | None |
| PATCH | `/voucher/:voucherId` | `ADMIN` | Partial voucher body |
| DELETE | `/voucher/:voucherId` | `ADMIN` | None |

## Payment Module (`/payment`)

| Method | Endpoint | Auth | Request |
| --- | --- | --- | --- |
| POST | `/payment/api/apple_in_app_purchase` | Public | Receipt payload with `serverVerificationData`, `dealId`, and related fields |
| POST | `/payment/api/google_in_app_purchase` | Public | `{ "productId", "serverVerificationData", "dealId", "price", "currency" }` |
| POST | `/payment/stripe_pay` | Logged user; service enforces `VENDOR` | `{ "dealId", "planId", "voucher?" }` |
| POST | `/webhook` | Stripe signature | Stripe signed webhook event |

Stripe flow:

1. Call `/payment/stripe_pay`.
2. Redirect to the returned `checkout_url`.
3. Stripe sends webhook events to `/webhook`.
4. The backend marks successful payments as paid and activates the promotion.

## Notification Module (`/notification`)

| Method | Endpoint | Auth | Request |
| --- | --- | --- | --- |
| GET | `/notification/` | Public | Query: `userId?`, `page?`, `limit?` |
| PATCH | `/notification/:id` | Public | Path param `id` |

## Dashboard Module (`/dashboard`)

All dashboard endpoints require `ADMIN`.

| Method | Endpoint | Request |
| --- | --- | --- |
| GET | `/dashboard/deals_by_category_stats` | None |
| GET | `/dashboard/vendor_stats` | Query: `searchTerm?`, `sort?`, `page?`, `limit?` |
| POST | `/dashboard/export_vendors` | Queue a complete vendor XLSX export |
| GET | `/dashboard/export_vendors/:jobId/status` | Poll export status and progress |
| GET | `/dashboard/export_vendors/:jobId/download` | Download a completed export within one hour |
| GET | `/dashboard/recent_deals` | QueryBuilder params |
| GET | `/dashboard/deals_stats` | Query: `searchTerm?`, `page?`, `limit?`, `sortBy?` |
| GET | `/dashboard/dashboard_analytics_total` | None |
| GET | `/dashboard/last_one_year_revenue_trend` | None |
| GET | `/dashboard/latest_transactions` | QueryBuilder params |
| POST | `/dashboard/send_notification_and_email` | `{ "title", "message", "channel", "to" }` |

Send notification payload:

```json
{
  "title": "Platform Maintenance",
  "message": "Maintenance window at 2:00 AM UTC.",
  "channel": {
    "push": true,
    "email": true
  },
  "to": {
    "all_users": true,
    "active_vendors": true
  }
}
```

## Static Content Module (`/static`)

| Method | Endpoint | Auth | Request |
| --- | --- | --- | --- |
| POST | `/static/create_page` | `ADMIN` | `{ "slug", "title", "content" }` |
| GET | `/static/all_pages` | Public | None |
| GET | `/static/:slug` | Public | Path param `slug` |
| PATCH | `/static/:slug` | `ADMIN` | Partial update body |

Allowed slugs:

- `about-us`
- `contact-us`
- `help-support`
- `terms-condition`
- `privacy-policy`

## cURL Examples

### Credentials Login

```bash
curl -X POST http://localhost:3002/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"vendor@example.com","password":"Password@123"}'
```

### Get My Profile

```bash
curl http://localhost:3002/api/v1/user/get_me \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### Create Deal

```bash
curl -X POST http://localhost:3002/api/v1/service \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -F 'files=@/path/deal-1.jpg' \
  -F 'files=@/path/deal-2.jpg' \
  -F 'qr=@/path/qr-500x500.png' \
  -F 'upc=@/path/upc-800x400.png' \
  -F 'data={"category":"6800d0b0f9f4e50bc1a11111","title":"Promo","regular_price":20,"discount":50,"highlight":["A"],"tags":["t"],"description":"Long enough description","coupon":"PROMO50","available_in_location":["6800d0b0f9f4e50bc1a22222"]}'
```

### Create Stripe Checkout Session

```bash
curl -X POST http://localhost:3002/api/v1/payment/stripe_pay \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"dealId":"<DEAL_ID>","planId":"<PLAN_ID>","voucher":"WELCOME10"}'
```
