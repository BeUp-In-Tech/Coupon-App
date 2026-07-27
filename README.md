# Yepp Ads Backend

Backend API for the Yepp Ads, deals, vendor, promotion, payment, and notification platform.

The service provides JWT-based authentication, vendor shop management, deal publishing, plan-based promotion payments, dashboard analytics, static CMS content, push notifications, and third-party payment verification.

## Contents

- [Yepp Ads Backend](#yepp-ads-backend)
  - [Contents](#contents)
  - [Overview](#overview)
  - [Tech Stack](#tech-stack)
  - [Prerequisites](#prerequisites)
  - [Getting Started](#getting-started)
  - [Environment Configuration](#environment-configuration)
  - [Available Scripts](#available-scripts)
  - [API Basics](#api-basics)
  - [Payments and Webhooks](#payments-and-webhooks)
  - [Background Workers](#background-workers)
  - [Operational Notes](#operational-notes)
  - [Security Notes](#security-notes)
  - [API Documentation](#api-documentation)

## Overview

| Item | Value |
| --- | --- |
| API prefix | `/api/v1` |
| Local API URL | `http://localhost:5000/api/v1` (or your configured `PORT`) |
| Health endpoint | `GET /api/v1/health/` |
| Swagger UI | `http://localhost:5000/api-docs` |
| Stripe webhook | `POST /webhook` |
| Main process | Express API server |
| Worker process | BullMQ notification/background worker |

Core capabilities:

- User, vendor, and admin authentication
- Refresh-token based session renewal
- Google OAuth, Apple Sign In, and mobile social-auth flows
- Vendor onboarding, shop profiles, and outlet management
- Coupon/deal creation with image, QR, and UPC media uploads
- Stripe Checkout for promotion payments
- Apple and Google in-app purchase verification
- Admin analytics, vendor stats, and revenue reporting
- Static CMS pages for legal/support content
- Notification storage and delivery through Firebase Cloud Messaging

## Tech Stack

| Area | Technology |
| --- | --- |
| Runtime | Node.js, TypeScript |
| Framework | Express 5 |
| Database | MongoDB with Mongoose |
| Cache/session | Redis |
| Queue | BullMQ |
| Media storage | Cloudinary |
| Payments | Stripe Checkout, Apple IAP, Google Play IAP |
| Push notifications | Firebase Admin SDK |
| Auth | JWT, credentials, Google OAuth, Apple Sign In |
| Process manager | PM2 |

## Prerequisites

- Node.js 20 or newer
- Yarn
- MongoDB
- Redis
- Cloudinary account
- Stripe account and webhook secret
- Firebase service account
- Google OAuth credentials
- Google Play service account credentials, if Google IAP verification is enabled
- Apple Sign In credentials, if Apple auth/IAP is enabled

## Getting Started

Install dependencies:

```bash
yarn install
```

Start MongoDB and Redis locally (or configure hosted instances), then create
your environment file. Every variable validated by
`src/app/config/env.ts` must have a non-empty value:

Create the local environment file:

```bash
cp .env.example .env
```

Update `.env` with project-specific values. The environment contract is defined in `.env.example` and validated by `src/app/config/env.ts`.

Run the API in development:

```bash
yarn dev
```

Verify the installation:

```text
GET http://localhost:5000/api/v1/health/
GET http://localhost:5000/api-docs
```

Run the worker in a second terminal:

```bash
yarn worker:dev
```

Build for production:

```bash
yarn build
```

Start production processes through PM2:

```bash
yarn start
```

`yarn start` uses `ecosystem.config.js` to start the API server in cluster mode and the worker as a single background process.

## Environment Configuration

Required environment groups:

| Group | Variables |
| --- | --- |
| Core | `PORT`, `MONGO_URI`, `NODE_ENV` |
| JWT | `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRATION` |
| OTP | `OTP_JWT_ACCESS_SECRET`, `OTP_JWT_ACCESS_EXPIRATION` |
| App URLs | `FRONTEND_URL`, `BACKEND_URL`, `DEEP_LINK` |
| Security | `BCRYPT_SALT_ROUND`, `REQUEST_RATE_LIMIT`, `REQUEST_RATE_LIMIT_TIME`, `EXPRESS_SESSION_SECRET` |
| Redis | `REDIS_HOST`, `REDIS_PORT` |
| Cloudinary | `CLOUDINARY_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_SECRET` |
| Email | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`, `EMAIL_FROM_NAME` |
| Google | `GOOGLE_OAUTH_ID`, `GOOGLE_OAUTH_SECRET`, `GOOGLE_CALLBACK_URL`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID` |
| Apple | `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_IOS_CLIENT_ID`, `APPLE_WEB_CLIENT_ID`, `APPLE_WEB_REDIRECT_URI` |
| Firebase | `TYPE`, `PROJECT_ID`, `PRIVATE_KEY_ID`, `PRIVATE_KEY`, `CLIENT_EMAIL`, `CLIENT_ID`, `AUTH_URI`, `TOKEN_URI`, `AUTH_PROVIDER_X509_CERT_URL`, `CLIENT_X509_CERT_URL`, `UNIVERSE_DOMAIN` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Admin seed | `ADMIN_MAIL`, `ADMIN_PASSWORD` |

Optional:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT` | JSON string used by the Google Play purchase verification flow |

## Available Scripts

| Command | Purpose |
| --- | --- |
| `yarn dev` | Run the API with `nodemon` and `ts-node-dev` |
| `yarn worker:dev` | Run the BullMQ worker in development |
| `yarn build` | Compile TypeScript and copy email/templates into `dist` |
| `yarn start` | Start production processes with PM2 |
| `yarn restart` | Restart PM2 processes |
| `yarn stop` | Stop PM2 processes |
| `yarn lint` | Run ESLint over `src` |
| `yarn format` | Format the repository with Prettier |

## API Basics

Full endpoint documentation lives in [docs/API_REFERENCE.md](docs/API_REFERENCE.md).

## API Documentation

- Local interactive Swagger UI: [http://localhost:5000/api-docs](http://localhost:5000/api-docs)
- Production Swagger UI: [https://api.yeppads.com/api-docs](https://api.yeppads.com/api-docs)
- Repository API reference: [docs/API_REFERENCE.md](docs/API_REFERENCE.md)
- OpenAPI source: [src/app/docs/lamin.yaml](src/app/docs/lamin.yaml)

The local Swagger URL uses the configured `PORT`; replace `5000` if needed.

Protected endpoints require:

```http
Authorization: Bearer <accessToken>
```

Supported roles:

- `USER`
- `VENDOR`
- `ADMIN`

Token flow:

1. Register, log in, or authenticate through a social provider.
2. Store the returned `accessToken` and `refreshToken`.
3. Send the access token in the `Authorization` header for protected routes.
4. Refresh expired access tokens with `POST /api/v1/auth/generate_token`.

Standard success response:

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Fetched deals",
  "data": {},
  "meta": {}
}
```

Standard error response:

```json
{
  "success": false,
  "message": "Validation failed message",
  "errorSources": [],
  "err": null,
  "stack": null
}
```

Common request conventions:

- JSON endpoints use `Content-Type: application/json`.
- Upload endpoints use `multipart/form-data`.
- Some multipart endpoints expect structured fields in a `data` form field as a JSON string.
- List endpoints may support `searchTerm`, `sort`, `page`, `limit`, `fields`, and `join`.

## Vendor List Export Endpoints

Admin-only vendor list export is available through the dashboard routes.

### 1) Queue vendor export

- Method: `POST`
- Path: `/api/v1/dashboard/export_vendors`
- Auth: `ADMIN`

Example response:

```json
{
  "success": true,
  "statusCode": 202,
  "message": "Vendor XLSX export queued successfully",
  "data": {
    "jobId": "64f8d2d9b2d4d9c2f1a0b1c2",
    "status": "waiting",
    "progress": 0
  }
}
```

### 2) Check export status

- Method: `GET`
- Path: `/api/v1/dashboard/export_vendors/:jobId/status`
- Auth: `ADMIN`

Example response:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Vendor export status fetched successfully",
  "data": {
    "jobId": "64f8d2d9b2d4d9c2f1a0b1c2",
    "status": "completed",
    "progress": 100,
    "rowCount": 1250,
    "expiresAt": "2026-07-02T10:30:00.000Z",
    "downloadUrl": "/api/v1/dashboard/export_vendors/64f8d2d9b2d4d9c2f1a0b1c2/download"
  }
}
```

### 3) Download exported XLSX file

- Method: `GET`
- Path: `/api/v1/dashboard/export_vendors/:jobId/download`
- Auth: `ADMIN`
- Response: binary Excel file (`.xlsx`)

Example response headers:

```http
HTTP/1.1 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="vendors-64f8d2d9b2d4d9c2f1a0b1c2.xlsx"
```

> The export file is available for about 1 hour after generation, then it expires and must be regenerated.

## Payments and Webhooks

Stripe promotion flow:

1. A vendor calls `POST /api/v1/payment/stripe_pay` with `dealId`, `planId`, and optional `voucher`.
2. The API creates a Stripe Checkout Session.
3. The client redirects the vendor to the returned Checkout URL.
4. Stripe sends payment events to `POST /webhook`.
5. The backend records the payment and activates the promotion after successful payment confirmation.

The webhook endpoint is intentionally outside `/api/v1` because Stripe calls it directly.

Apple and Google in-app purchase verification endpoints are also available for mobile purchase flows. See [docs/API_REFERENCE.md](docs/API_REFERENCE.md#payment-module-payment) for payload details.

## Background Workers

The worker handles queue-driven background work such as notification delivery.

Development:

```bash
yarn worker:dev
```

Production:

```bash
yarn start
```

Redis must be available before starting the API or worker.

## Operational Notes

- MongoDB is required for application data.
- Redis is required for caching, sessions, OTP, and queues.
- Admin credentials are seeded from `ADMIN_MAIL` and `ADMIN_PASSWORD`.
- Rate limiting is configured globally with `REQUEST_RATE_LIMIT` and `REQUEST_RATE_LIMIT_TIME`.
- Cloudinary is required for shop, category, plan, deal, QR, and UPC media uploads.
- Firebase credentials are required for FCM delivery.
- For non-local Redis deployments, verify both API and queue connection settings before release.

## Security Notes

Known implementation notes that should be reviewed before public production launch:

- Notification routes are currently documented as public in the API reference.
- In-app purchase endpoints are currently documented as public in the API reference.
- Some service-layer errors still use generic `Error(...)` strings and should be normalized to the shared API error format.
- Production environments must use strong secrets and must not reuse example values from `.env.example`.


