# InfiniLink

InfiniLink is a WeChat Mini Program codebase for a community-style product. The repository now includes both the original client application and a new standalone Go backend under `backend/`.

## Architecture

- WeChat Mini Program native project
- Go backend under `backend/`
- Page-based structure under `pages/`
- Shared business logic under `mixins/`
- Reusable components under `components/`
- UI library vendored in `linui/`
- HTML rendering component vendored in `components/mp-weixin/`
- Backend API endpoints configured in `config/api.js`

## What Is Included

- Frontend mini program pages and components
- Standalone Go + PostgreSQL backend in `backend/`
- Login, content feed, circles, messaging, profile, search, payment entry flows
- WeChat project config files

## What Is Missing

- Real WeChat Pay merchant integration
- Production object storage / CDN wiring
- Production deployment manifests for multi-node rollout

The frontend depends on `/api/v1/*` endpoints. Those are now implemented in the `backend/` folder, with PostgreSQL migrations, static compatibility assets, and Docker support.

## Local Run

1. Install WeChat DevTools.
2. Open this folder as a Mini Program project.
3. Start the backend in `backend/`.
4. Use Docker Compose there if you want to keep the existing frontend API root unchanged.
5. Use your own Mini Program `AppID` in WeChat DevTools.
6. Make sure the backend domain is added to the Mini Program request and upload domain allowlists.

## Important Handover Notes

- The current branding inside the code still uses `轻航`.
- `project.config.json` still contains the previous Mini Program `appid`.
- Several UI assets are still referenced from `http://127.0.0.1/storage/...`; the backend now includes a compatibility fallback, but you should still migrate them to your own asset host.
- Payment flows still require real WeChat Pay integration.

## Suggested Next Steps

1. Replace all old branding with `InfiniLink`.
2. Configure the new backend for your own domains and secrets.
3. Move hardcoded remote image assets to your own domain.
4. Add an environment-based config layer for dev, test, and prod.
5. Add basic regression testing and a release checklist.
