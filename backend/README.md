# InfiniLink Backend

`backend/` is the standalone service layer added for the existing WeChat Mini Program frontend. The frontend stays untouched; this service keeps the current `/api/v1/*` contract, `token` header, and `code/status/data` response shape.

## Current architecture

- `cmd/api`
  Go HTTP entrypoint and graceful shutdown
- `internal/server`
  Router, handlers, Redis cache, payment flow, WeChat login + pay integration
- `internal/migrate`
  PostgreSQL schema and seed data
- `nginx/default.conf`
  Reverse proxy, gzip, static cache, rate limiting
- `loadtest/*.js`
  k6 pressure-test scripts

## Production-oriented pieces in this version

- PostgreSQL connection pool tuning
- Redis read cache for hot endpoints and user profile reads
- WeChat Mini Program `code2session` login support with `openid` persistence
- WeChat Pay API v3 SDK integration
- `if-pay` server-to-server integration entry
- Payment callback persistence and idempotent order settlement
- Docker image running as non-root
- Nginx reverse proxy config
- k6 benchmark scripts

## Local run

1. Copy env:

```bash
cd backend
cp .env.example .env
```

2. Start local stack:

```bash
docker compose up --build
```

3. Service URLs:

- Mini Program API root: `http://127.0.0.1/api/v1`
- Health: `http://127.0.0.1/healthz`
- Ready check: `http://127.0.0.1/readyz`

## Production deploy

1. Prepare env:

```bash
cd backend
cp .env.production.example .env.production
```

2. Fill at least these values:

- `PUBLIC_BASE_URL`
- `JWT_SECRET`
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `WXPAY_MCH_ID`
- `WXPAY_API_V3_KEY`
- `WXPAY_SERIAL_NO`
- `WXPAY_PRIVATE_KEY`
- `WXPAY_NOTIFY_URL`
- `IF_PAY_BASE_URL`
- `IF_PAY_API_SECRET`

3. Start production compose:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

## Payment integration

### WeChat Pay

The backend now supports:

- Mini Program login `code -> openid`
- JSAPI prepay order creation
- WeChat Pay callback verification
- Idempotent order settlement after callback

Required envs:

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `WXPAY_MCH_ID`
- `WXPAY_API_V3_KEY`
- `WXPAY_SERIAL_NO`
- `WXPAY_PRIVATE_KEY`
- `WXPAY_NOTIFY_URL`

### IF-Pay

`if-pay` is wired as a server-to-server payment channel pointing to the Infinitech payment center.

Default request target:

- `POST ${IF_PAY_BASE_URL}/api/wallet/payment`

Expected usage:

- `payment_method=ifpay`
- backend forwards order number, user id, amount in cents, idempotency key
- response is recorded into `orders.payment_payload`

If your payment center expects a different path, change `IF_PAY_CREATE_PATH`.

## Load test

Public read mix:

```bash
k6 run -e BASE_URL=http://127.0.0.1 backend/loadtest/public-feed.js
```

Authenticated read mix:

```bash
k6 run -e BASE_URL=http://127.0.0.1 -e TOKEN=your_token backend/loadtest/auth-order.js
```

Optional order-create pressure:

```bash
k6 run \
  -e BASE_URL=http://127.0.0.1 \
  -e TOKEN=your_token \
  -e ENABLE_ORDER_CREATE=true \
  -e PAYMENT_METHOD=ifpay \
  backend/loadtest/auth-order.js
```

Use sandbox credentials or a dedicated staging environment before enabling order creation.

## 50k concurrency note

This version is much closer to production, but `5 万并发` is still an infrastructure target, not a single-container promise. To actually hold that level, use:

- multiple backend replicas behind SLB / Nginx / ingress
- managed PostgreSQL with read replicas or clear write/read split strategy
- managed Redis
- object storage + CDN for uploads
- callback endpoints exposed through public HTTPS
- distributed k6 or dedicated benchmark nodes, not one laptop

What this repo now gives you is the app-side compatibility, payment chain, cache layer, reverse proxy config, and deployment baseline to scale from.
