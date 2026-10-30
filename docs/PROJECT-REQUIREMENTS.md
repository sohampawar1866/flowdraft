# FlowDraft product requirements

**Status:** Prototype workflow implemented; Gmail's private compose markup remains a compatibility risk.
**Product:** FlowDraft for Gmail
**Last reviewed:** 2026-10-30

## Goal

Let a Wispr Flow user dictate a complete email once in a new Gmail compose. FlowDraft parses the inserted transcript, places fields into the draft, and applies clear inline formatting requests. The user remains responsible for reviewing and sending it.

## Supported workflow

1. The user opens a new, blank Gmail compose. FlowDraft attempts to focus the message body automatically.
2. The user dictates with Wispr Flow and includes one explicit recipient email address, a subject, and message content in natural language.
3. Optional inline formatting commands are introduced with “Hey Wispr” or “Hey Wispr Flow”. Supported actions are bold, italic, center, and bullets.
4. After the inserted text settles, FlowDraft sends one combined parse request. Unclear required fields leave the transcript in Gmail and produce a clarification message.
5. When the parsed result is clear, FlowDraft applies it only to the same compose and verifies the Gmail recipient chip, subject, and body. A failed update is reported and the user is asked to review the draft.
6. The user reviews, edits, and sends the email manually.

The side panel contains instructions, quota, and status. It may be closed during dictation and processing. The extension reacts to text inserted by Wispr Flow; it does not record audio.

## Requirements

- Support new blank Gmail compose windows in Chrome. Replies and previously started drafts must not be auto-processed.
- Recognize Wispr-style paste and large/burst text insertion only when the transcript has clear email intent and an explicit email address.
- Use one combined AI request for email fields and formatting.
- Accept clear natural phrasing for recipient, subject, and body; do not require literal “To / Subject / Message” labels.
- Require exactly one explicit address in the transcript and a matching parsed recipient. Never invent recipients or required content.
- Apply only bold, italic, center, and bullets. A repeated text target is ambiguous unless the user explicitly says “every” or equivalent.
- Apply results only when the originating compose still contains the captured transcript. Never click or invoke Gmail's Send action.
- Keep the dictated transcript recoverable and report failures in Gmail, including when the sidebar is closed.
- Show the server-reported per-installation allowance, capped at 25. The API also enforces a shared configurable daily cap, defaulting to 500 requests per UTC day.
- Do not persist or log email text. Keep Bedrock credentials on the API server.

## Privacy and scope

The user must acknowledge that dictated text is sent to the FlowDraft API and Amazon Bedrock for processing. The extension has no Gmail OAuth, mailbox search, microphone, or email-send permission. The API stores installation identifiers and quota counts, not message text.

Initial support is Gmail web in Chrome. The extension uses Gmail's private page DOM because the prototype needs to react to hands-free dictation in the currently open compose. Google's supported Gmail add-on and API integrations do not expose that same automatic in-page workflow, so Gmail changes may require adapter updates. Do not describe the integration as guaranteed against future Gmail changes.

## Out of scope

- Automatically sending or scheduling email.
- Reading/searching mailbox contents or modifying existing messages.
- Recording audio, listening in the background, or translating speech.
- Supporting Outlook, Apple Mail, or general-purpose editors.
- Treating an installation UUID as user authentication or guaranteed abuse prevention.

## Acceptance baseline

- A valid new-compose dictation can be parsed into the recipient, subject, and body in one request.
- Supported formatting is applied only to clear targets; unclear targets are reported without guessing.
- Failed or incomplete application leaves the user with a recoverable transcript and a truthful status message.
- The extension never sends the email; the user can review and send in Gmail.
