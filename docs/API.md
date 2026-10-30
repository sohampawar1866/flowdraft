# API reference

The API is the public service used by the Chrome extension. The default deployed base URL is `https://wispr-voice-email-api.onrender.com`; local development uses `http://localhost:8787`.

## Health

`GET /health` returns `200` and `{"ok":true}` when the process responds. It is a liveness check, not a complete check that Bedrock credentials or database operations are healthy.

## Usage

`GET /v1/usage?installationId=<uuid>` returns:

```json
{"requestsRemaining": 24}
```

The value is the remaining installation allowance out of 25. A malformed UUID returns `400`; a database failure returns `503`.

## Voice parsing

`POST /v1/voice/parse` accepts one transcript with an installation UUID:

```json
{"installationId":"00000000-0000-4000-8000-000000000000","transcript":"Send this email to sam@example.com..."}
```

The transcript is limited to 12,000 characters. On a usable model response, the API returns `recipient`, `subject`, `body`, `formatting`, `clarification`, and `requestsRemaining`. Missing or unclear required fields are returned as `null`; the API does not guess the recipient. Formatting actions are `bold`, `italic`, `center`, or `bullets`.

## Limits and errors

- Per installation: 25 AI requests.
- Shared service limit: `MAX_DAILY_AI_REQUESTS`, default 500 per UTC day.
- Rate limit: 80 requests per IP per hour by default.
- Body limit: 16 KiB at Fastify; transcript limit: 12,000 characters.
- Quotas are reserved atomically before Bedrock. Model failures remain counted. `429` is returned at quota limits; daily-cap responses include `Retry-After`. Provider preflight and database failures return `503` without a model call.
- Invalid requests return `400`; unusable model output or model call failures return `502`.

The service also retains `/v1/email/parse` and `/v1/format/parse` compatibility routes for older clients. The current extension uses the combined `/v1/voice/parse` route.

## Data handling

Request text is passed to Bedrock for processing and is not intentionally logged or stored by FlowDraft. Postgres stores installation UUIDs, per-installation counts, and one aggregate daily counter. The daily limit caps request count, not exact provider cost.
