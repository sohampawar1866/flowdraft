# FlowDraft for Gmail

FlowDraft is a Chrome extension for people who dictate with Wispr Flow. It takes one dictated email, separates the recipient, subject, and message, and can apply spoken formatting commands to a new Gmail draft. It never sends email; the user reviews and sends from Gmail.

## How it works

1. Open a new, blank Gmail compose. FlowDraft tries to focus its message body automatically.
2. Hold Fn and dictate the email naturally. Include the recipient's full email address and clear subject and message wording.
3. For inline formatting, say “Hey Wispr” or “Hey Wispr Flow” before a command. Supported actions are bold, italic, center, and bullets.
4. Release Fn. After Wispr Flow inserts the text and it settles, FlowDraft sends one parse request, then fills and formats the same Gmail draft if the result is clear.
5. Review and correct the draft in Gmail. Click Gmail's Send button yourself when ready.

## Why it helps

Developers often send several brief but important team updates in a day. Repeatedly switching between Gmail fields and manually formatting key details interrupts that flow. FlowDraft lets them dictate the update and its formatting in one pass, then review the finished draft. A copy-ready project description for the hackathon form is in [Project submission copy](docs/PROJECT-PITCH.md).

The side panel shows setup guidance, the installation's remaining quota, and status. It does not need to stay open for capture or processing. Replies, existing drafts, unrelated typing, and text without clear email cues are not intended to be processed. If FlowDraft cannot safely apply the result, it keeps the transcript available and reports the problem in Gmail.

## What the prototype supports

- Chrome and Gmail web, for new blank compose windows.
- Wispr Flow as the speech-to-text input method. FlowDraft does not listen to audio or request microphone access.
- Natural email phrasing and inline formatting in the same dictation.
- Formatting exact phrases or the just-spoken line; “every” explicitly applies to repeated matches.
- Manual review and sending in Gmail.

Gmail's compose markup is private and can change. The Gmail adapter and sanitized fixture cover the observed structure, but this integration is a prototype rather than a stable Gmail API. See [architecture and limits](docs/ARCHITECTURE.md).

## Privacy and limits

When a user accepts the one-time privacy notice, recognized dictation text is sent to the FlowDraft API and Amazon Bedrock for processing. FlowDraft does not save the text or log it. The API stores an installation UUID and request counts in Postgres.

- 25 AI requests per extension installation.
- 500 AI requests per UTC day shared across installations by default (`MAX_DAILY_AI_REQUESTS`). Both limits are reserved atomically before a model call; failed model calls remain counted.
- The API also limits request size and applies IP-based rate limiting. An installation ID is not a verified identity and can be reset by clearing extension data or reinstalling.
- The extension contains the public API URL, not Bedrock credentials. It has no Gmail OAuth, mailbox scanning, microphone, or email-send permission.

The usage caps bound request counts, not a precise dollar amount. Keep per-request limits and AWS spending alerts enabled for a public demo.

## Requirements

- Node.js 22.13 or later and npm.
- Chrome for loading and trying the extension.
- PostgreSQL and an AWS Bedrock API bearer token/model to run the API locally.
- A configured deployed API and enabled Bedrock model to use the published extension.

## Local development

From the repository root:

```sh
npm ci
cp apps/api/.env.example apps/api/.env
```

Set the values in `apps/api/.env` for PostgreSQL and Bedrock, then start the API:

```sh
npm run dev:api
```

In another terminal, point the development extension at that API and start WXT:

```sh
WXT_API_BASE_URL=http://localhost:8787 npm run dev:extension
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the generated `apps/extension/.output/chrome-mv3` directory. Open Gmail and reload the tab after reloading or replacing the extension.

Configuration details are in [Development and deployment](docs/DEVELOPMENT.md). API endpoints and quota behavior are in [API reference](docs/API.md).

## Commands

```sh
npm run dev:extension  # Start the local extension dev server
npm run dev:api        # Start the local API
npm run typecheck      # Type-check the extension and API
npm test               # Run the automated test suites
npm run build          # Build API and extension
npm run zip            # Build a Chrome Load unpacked ZIP
```

## Releases and installation

The GitHub Actions workflow creates a release when a `v*` tag is pushed. It checks the tag against `apps/extension/package.json`, builds the extension with the production Render API URL, verifies the packaged manifest version, and attaches `flowdraft-chrome.zip`.

To publish a new extension version:

1. Update `apps/extension/package.json` and `package-lock.json` to the same semantic version.
2. Commit and push the changes to `main`.
3. Create and push the matching tag, for example `v0.1.13`.
4. Wait for the `Build and release Chrome extension` GitHub Actions workflow. The release title uses **FlowDraft Stable** and the ZIP is named `flowdraft-chrome.zip`.

Download the ZIP from the latest GitHub Release, extract it, then in Chrome open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and choose the extracted folder containing `manifest.json`. Chrome loads the extracted folder, not the ZIP itself. The latest ZIP can be linked from a landing page with:

`https://github.com/sohampawar1866/flowdraft/releases/latest/download/flowdraft-chrome.zip`

## License

FlowDraft is released under the [MIT License](LICENSE). You may use, modify, and redistribute it under that license's terms.
