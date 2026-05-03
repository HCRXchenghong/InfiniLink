# InfiniLink Backend

Go + PostgreSQL backend for the existing WeChat Mini Program frontend.

## Run Locally

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL and Redis.
3. Run `go run ./cmd/api`.

## Docker

```bash
docker compose up --build
```

## Notes

- `token` auth header is compatible with the current frontend.
- The backend returns the same `code/status/data` envelope the mini program already expects.
- `docker compose` exposes the backend on `http://127.0.0.1` so the existing frontend API root can stay unchanged.
- Payment is wired as a placeholder until real WeChat Pay credentials are added.
- For 50k concurrency, deploy behind a load balancer and move uploads/media to object storage + CDN.
