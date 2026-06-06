# Yepp Marv Backend

Backend API for the Yepp Marv coupon, deals, vendor, promotion, payment, and notification platform.

The service provides JWT-based authentication, vendor shop management, deal publishing, plan-based promotion payments, dashboard analytics, static CMS content, push notifications, and third-party payment verification.

## Contents

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
- [Documentation Roadmap](#documentation-roadmap)

## Overview

| Item | Value |
| --- | --- |
| API prefix | `/api/v1` |
| Local API URL | `http://localhost:3002/api/v1` |
| Health endpoint | `GET /` |
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

Create the local environment file:

```bash
cp .env.example .env
```

Update `.env` with project-specific values. The environment contract is defined in `.env.example` and validated by `src/app/config/env.ts`.

Run the API in development:

```bash
yarn dev
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

## Documentation Roadmap

Recommended next steps for long-term API quality:

1. Add an `openapi.yaml` contract as the source of truth.
2. Generate Postman, Swagger UI, or Redoc docs from the OpenAPI contract.
3. Add CI checks that fail when routes or schemas change without documentation updates.
4. Document webhook retry behavior and idempotency expectations.
5. Add changelog entries for new endpoints, behavior changes, breaking changes, and migrations.

