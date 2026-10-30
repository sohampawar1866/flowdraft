# Architecture and compatibility notes

## Components

```text
Wispr Flow
   │ inserts transcript into Gmail's message body
   ▼
Chrome Gmail content script ──► extension service worker ──► FlowDraft API
         ▲                              │                       │
         └──── apply verified result ───┘                       ├── Postgres quota store
                                                                └── Amazon Bedrock
```

- `apps/extension/entrypoints/gmail.content.ts` detects eligible new blank Gmail composes, watches for Wispr-style inserted text, and displays status in Gmail.
- `apps/extension/lib/gmail-dom.ts` is the Gmail DOM adapter. It focuses the body, commits recipient chips, writes subject/body, applies allowed formatting, and verifies or rolls back updates.
- `apps/extension/entrypoints/background.ts` calls the API and routes the parsed result back to the originating compose. It keeps working when the side panel is closed.
- `apps/extension/entrypoints/sidepanel/` shows the privacy notice, instructions, installation quota, and request status.
- `apps/api/` is a Fastify service. It validates requests, performs preflight checks, reserves quotas in Postgres, calls Bedrock with a named tool schema, validates the result, and returns it.
- `packages/contracts/` contains response schemas shared by the extension and API.

## Gmail adapter

Gmail's visible compose UI is implemented with internal DOM structures that Google does not promise as a stable extension API. FlowDraft uses an observed structure: a compose dialog, recipient container (`[name="to"]`), nested recipient input, recipient chip, subject input, and editable message body. A sanitized fixture in `gmail-dom.test.ts` models this shape; it contains no account-specific information.

The adapter applies a result only to the compose identified when the dictation was captured and only if the captured transcript is still present. It commits the recipient through the recipient input, checks Gmail's resulting chip, then applies subject, body, and formatting. Failures attempt a rollback through Gmail's controls and show an error rather than claiming success. Gmail can change these selectors or event semantics; check the live UI after Gmail updates.

## Dictation and formatting flow

The content script observes paste/drop and text insertion events. It waits for the text to settle, checks for strong email cues and an explicit address, and suppresses repeated handling while a request is in progress. The worker sends one `/v1/voice/parse` request so a complete email and its inline formatting use one allowance. It verifies the returned recipient against the address in the transcript. Formatting commands are applied only after the body has been filled and verified.

The extension never invokes Gmail's Send button. FlowDraft does not capture audio; Wispr Flow performs transcription and inserts text into the focused field.

## API and quota controls

AI endpoints validate body size and installation UUID, run provider preflight, then reserve installation and shared daily quotas atomically in Postgres. The installation cap is 25 requests. `MAX_DAILY_AI_REQUESTS` defaults to 500 and the shared counter uses UTC days. Reservations are not refunded after model failures because the provider may have received the call. Database or preflight failures stop before Bedrock.

The extension carries only the public API URL. AWS credentials remain in server configuration. Installation IDs are client-generated and forgeable, so the quotas and IP rate limit bound prototype usage but do not authenticate people or guarantee a fixed spend ceiling.
