# Development and deployment

## Local setup

Requirements: Node.js 22.13+, npm, Chrome, PostgreSQL, and an AWS Bedrock bearer key with access to a Converse/tool-use model in the selected region.

1. From the repo root, run `npm ci`.
2. Copy `apps/api/.env.example` to `apps/api/.env` and set `DATABASE_URL`, `AWS_REGION`, `BEDROCK_MODEL_ID`, and `AWS_BEARER_TOKEN_BEDROCK`. `MAX_DAILY_AI_REQUESTS` is optional and defaults to 500.
3. Run `npm run dev:api`. The API creates its usage tables on startup.
4. In a second terminal, run `WXT_API_BASE_URL=http://localhost:8787 npm run dev:extension`.
5. In Chrome, open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select `apps/extension/.output/chrome-mv3`.
6. Reload the Gmail tab after loading or reloading the extension. Sign in to Gmail, open the side panel once to accept the privacy notice, then use a new blank compose and Wispr Flow.

Do not commit `.env` files, bearer keys, database URLs, or live dictated text. `.env.example` contains placeholders only.

## Configuration

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | API | PostgreSQL connection string; required. |
| `AWS_REGION` | API | AWS region containing the enabled Bedrock model. |
| `BEDROCK_MODEL_ID` | API | Converse/tool-use model ID; defaults to `amazon.nova-pro-v1:0`. |
| `AWS_BEARER_TOKEN_BEDROCK` | API | Server-side Bedrock API key; never add to the extension. |
| `MAX_DAILY_AI_REQUESTS` | API | Shared UTC-day request cap; defaults to `500`. |
| `PORT` | API | Listener port; defaults to `8787` locally. |
| `NODE_ENV` | API | Production enables TLS for the Postgres connection. |
| `WXT_API_BASE_URL` | Extension build | Public API base URL embedded into the extension; defaults to the deployed Render URL. |

The API uses the Bedrock bearer token when present and does not require long-term AWS access key variables for that path. Do not publish the token.

## Render

`render.yaml` describes the Node API, a Postgres database, `/health` health check, and the 500-request daily default. Set `AWS_REGION`, `AWS_BEARER_TOKEN_BEDROCK`, and any desired model/cap overrides in Render. Render supplies `DATABASE_URL` from the database resource. Review Render's current free-plan limits and database retention in its dashboard; those terms can change.

The free web service may sleep when idle, so the first request can be delayed. The `/health` route is a process liveness check. A health monitor can keep the service active only subject to the hosting provider's current policy and plan limits.

## Build, release, and install

The release workflow runs for a pushed `v*` tag. It checks the tag against `apps/extension/package.json`, installs from the lockfile, builds the extension with the production API URL, checks the manifest version, and attaches `flowdraft-chrome.zip` to a GitHub Release.

For a new extension release, update `apps/extension/package.json` and its matching package-lock entry, commit and push `main`, then push the matching `vX.Y.Z` tag. The WXT config reads the manifest version from the extension package file; it has no separate version value. GitHub release downloads can be installed by extracting the ZIP and selecting the extracted directory containing `manifest.json` via Chrome's **Load unpacked** action.

## Useful commands

```sh
npm run dev:api
npm run dev:extension
npm run typecheck
npm test
npm run build
npm run zip
```
