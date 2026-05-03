# InfiniLink

InfiniLink is a WeChat Mini Program codebase for a community-style product. This repository contains the client application only.

## Architecture

- WeChat Mini Program native project
- Page-based structure under `pages/`
- Shared business logic under `mixins/`
- Reusable components under `components/`
- UI library vendored in `linui/`
- HTML rendering component vendored in `components/mp-weixin/`
- Backend API endpoints configured in `config/api.js`

## What Is Included

- Frontend mini program pages and components
- Login, content feed, circles, messaging, profile, search, payment entry flows
- WeChat project config files

## What Is Missing

- No backend source code
- No database schema
- No deployment scripts for server-side services

This app depends on external APIs such as `/api/v1/login`, `/api/v1/user/info`, `/api/v1/order`, and file upload endpoints. You will need a compatible backend before the project can run end to end.

## Local Run

1. Install WeChat DevTools.
2. Open this folder as a Mini Program project.
3. Use your own Mini Program `AppID` in WeChat DevTools.
4. Update `config/api.js` to point to your backend domain instead of `127.0.0.1`.
5. Make sure the backend domain is added to the Mini Program request and upload domain allowlists.

## Important Handover Notes

- The current branding inside the code still uses `轻航`.
- `project.config.json` still contains the previous Mini Program `appid`.
- Several UI assets are referenced from `http://127.0.0.1/storage/...`; these should be migrated to your own CDN or static asset host.
- Payment flows require a working WeChat Pay backend.

## Suggested Next Steps

1. Replace all old branding with `InfiniLink`.
2. Stand up or obtain the backend API.
3. Move hardcoded remote image assets to your own domain.
4. Add an environment-based config layer for dev, test, and prod.
5. Add basic regression testing and a release checklist.

