# FlowDraft for Gmail

FlowDraft is a Chrome side-panel extension that lets Wispr Flow users dictate a complete Gmail draft and include spoken formatting commands in the same dictation. It fills the draft for review and never sends email.

## Repository layout

```text
apps/
  api/          Fastify API and Bedrock integration
  extension/    WXT + Vite + React Chrome extension
packages/
  contracts/    Shared API response schemas and TypeScript types
docs/           Product requirements and optional project ideas
render.yaml     Render API and Postgres deployment blueprint
```

## Local setup

Requirements: Node.js 22.13+, npm, Chrome, and a local Postgres database. For AI parsing, configure an AWS Bedrock bearer key and a model that supports Converse tool use in your selected region.

1. Install dependencies from the repository root:

   ```sh
   npm install
   ```

2. Copy `apps/api/.env.example` to `apps/api/.env` and set `DATABASE_URL`, `AWS_REGION`, `BEDROCK_MODEL_ID`, and `AWS_BEARER_TOKEN_BEDROCK`. Start the API; it creates its usage tables on startup:

   ```sh
   npm run dev:api
   ```

3. In another terminal, start WXT with the local API URL:

   ```sh
   WXT_API_BASE_URL=http://localhost:8787 npm run dev:extension
   ```

4. In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension/.output/chrome-mv3`.
5. Open Gmail, open FlowDraft from Chrome’s toolbar, and start a new blank compose. FlowDraft focuses the message body. Hold Fn and dictate the recipient, subject, and message using “To”, “Subject”, and “Message” cues. Say “Hey Wispr” before a formatting instruction, then release Fn.

The extension prompts once before sending dictated text to the API. The service uses Bedrock to extract email fields and inline formatting commands in one request; the browser alone performs Gmail edits. Review the completed draft and send it using Gmail.

## Deploying the API to Render

`render.yaml` defines one free Node web service and one small, free Postgres database for the hackathon. Configure these Render environment variables/secrets:

- `AWS_REGION` — for example, `us-east-1`.
- `BEDROCK_MODEL_ID` defaults to `amazon.nova-pro-v1:0`; change it only if you choose another enabled Converse/tool-use model.
- `MAX_DAILY_AI_REQUESTS` defaults to `500`. The same daily UTC cap applies to email parsing and formatting across all installations.
- `AWS_BEARER_TOKEN_BEDROCK` — your Bedrock API bearer key. Keep it in Render’s secret field; never put it in extension code or commit it.
- `DATABASE_URL` is supplied automatically by the Postgres resource in the Blueprint; you do not copy or create this connection string yourself.
- `NODE_ENV=production` is set by the Blueprint.

The server uses the bearer token directly; it does not need `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` when the bearer token is set. If you use a short-term key, it expires with the AWS session (up to 12 hours), so use a suitable long-term Bedrock API key for a continuously hosted demo or replace the secret when it expires.

The free Render Postgres plan has 1 GB of storage and expires 30 days after creation. Upgrade it before then if you need to keep its data longer.

The free API service normally spins down after 15 minutes without incoming traffic. An external monitor can request `/health` every 10 minutes to keep it warm; occasional scheduler delays or Render maintenance can still cause a cold start. Render includes 750 free service hours per workspace each month, shared across free services. Use a paid always-on plan if dependable no-cold-start availability is more important than keeping hosting free.

After the service is live, set `WXT_API_BASE_URL` to the Render service URL when building the extension. The extension build embeds this public API URL; it does not contain AWS credentials.

## Root commands

```sh
npm run dev:extension
npm run dev:api
npm run typecheck
npm test
npm run build
npm run zip
```

## Download and install a test build

Pushing a version tag such as `v0.1.0` runs the GitHub Actions release workflow. It builds the Chrome extension with the deployed API URL and publishes `flowdraft-chrome.zip` on the matching GitHub Release. The ZIP has `manifest.json` at its root: download it, extract it, open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select the extracted folder. Do not choose the ZIP file itself.

To release a later extension version, update the version in `apps/extension/package.json` and `apps/extension/wxt.config.ts` to match the new `vX.Y.Z` tag, then push that tag. The landing page can link directly to `https://github.com/sohampawar1866/flowdraft/releases/latest/download/flowdraft-chrome.zip` so its download button follows the latest published release.

The API tests use injected fake usage/model dependencies and do not call AWS. A live Gmail trial still needs a Chrome profile, Wispr Flow, a deployed/configured API, Postgres, and an enabled Bedrock model.

## Product behavior and privacy

- The Gmail content script auto-focuses the body of a new blank compose and only processes a paste with explicit email cues or the reserved “Hey Wispr” marker. It fills and formats the draft and never finds or clicks Gmail’s Send button.
- A shared schema package keeps the extension and API aligned on their response formats.
- Email text is not logged or saved in Postgres. The database stores random installation IDs, their usage counts, and one aggregate daily request count.
- Valid AI attempts reserve both the installation allowance and shared daily allowance before calling Bedrock. Failed model calls remain counted because the provider may have processed them; database failures fail closed without calling Bedrock.
- Browser permissions cover local extension storage, the side panel, the keyboard command and Gmail’s compose surface. There is no Gmail OAuth, mailbox search, microphone access, background audio listening or send permission.
- The first release targets Gmail web in Chrome. Outlook, Apple Mail and other editors are not supported.

The request allowance is associated with an installation UUID, not a verified person. Reinstalling or clearing extension storage may reset it. IP rate limiting is supplementary abuse protection and does not establish a person’s identity.

See [product requirements](docs/PROJECT-REQUIREMENTS.md) and [optional idea](docs/OPTIONAL-IDEA.md).
