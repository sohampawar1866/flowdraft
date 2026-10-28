# Project Requirements: Voice-First Email Composer

**Status:** Implemented first-release workflow (subject to live Gmail verification)
**Hackathon:** WeMakeDevs × Wispr Flow
**Working name:** TBD
**Current focus:** Gmail compose and voice-based message formatting

## 1. Product idea

Build a small browser extension that helps people compose and polish an email with Wispr Flow. A user dictates the recipient, subject, and message in one pass. The extension sorts the words into the right email fields and can handle inline voice commands to format a line or phrase in the message body.

The extension makes Wispr Flow useful for more than entering a block of text: the user can speak both the content and what should happen to it.

## 2. Problem

Dictating an email into one field is easy, but composing a complete email often means switching between recipient, subject, and message fields. Voice dictation also enters formatting instructions as words unless the user has a clear way to issue them as commands. This project should let the user speak a complete email, review its structure, and make simple formatting changes by voice.

## 3. Intended users

- People who prefer speaking to typing or have difficulty using a keyboard.
- People who draft many short emails and want to dictate the whole draft naturally.
- Wispr Flow users who want spoken instructions to change their email, not just appear as text in it.

## 4. Main user journey

1. The user installs the extension, opens its sidebar, and opens a new blank Gmail compose.
2. FlowDraft focuses the Gmail message body. The user holds Fn and dictates the recipient, subject, and body using clear “To”, “Subject”, and “Message” cues.
3. In the same dictation, the user can say “Hey Wispr” before a formatting request, such as “make the heading I just said bold” or “bold every ‘Report Card’.”
4. After Fn is released and Wispr Flow inserts the transcript, the extension sends one request to parse the email and inline formatting commands.
5. The extension fills the Gmail draft and applies clear formatting commands. If required email fields are unclear, it leaves the transcript in the body and asks for clarification. Unclear formatting is skipped and reported.
6. The user reviews and sends the email themselves.

## 5. Functional requirements

### Email composition

- **REQ-EMAIL-1:** A user must be able to dictate the recipient, subject, and message body in one composition flow.
- **REQ-EMAIL-2:** The extension must identify the three parts and place them in the matching fields in the initial supported mail app.
- **REQ-EMAIL-3:** The extension must fill the open Gmail draft automatically when parsing succeeds; the user must be able to inspect and correct it in Gmail before sending.
- **REQ-EMAIL-4:** The extension must never send an email without the user’s explicit action in the mail app.
- **REQ-EMAIL-5:** If the recipient or another required part cannot be understood, the extension must ask for clarification and must not silently guess.

### Voice formatting

- **REQ-FORMAT-1:** The user can issue inline formatting commands during the same dictation by saying the reserved “Hey Wispr” marker; a separate key or input box is not required.
- **REQ-FORMAT-2:** The first-release command set is bold, italic, center alignment, and bullets.
- **REQ-FORMAT-3:** The user must be able to refer to the most recently dictated line or paragraph, an exact phrase already in the body, or all occurrences of an exact phrase.
- **REQ-FORMAT-4:** Commands such as “bold every ‘Report Card’” apply to all matching text in the message body. A request without “every” must not silently change multiple matches; the extension skips that formatting and explains that the phrase is ambiguous.
- **REQ-FORMAT-5:** Formatting commands must not change the recipient or subject fields.
- **REQ-FORMAT-6:** The extension reports whether formatting was applied or skipped. The user can correct the draft in Gmail before sending.

### Wispr Flow use

- **REQ-FLOW-1:** Wispr Flow must be the voice-input method used in the demonstrated workflow.
- **REQ-FLOW-2:** The user dictates into the Gmail message body. The extension recognizes clear email cues and the reserved formatting marker in Wispr Flow’s inserted text.
- **REQ-FLOW-3:** The product must not claim that Wispr Flow itself parses email fields or performs formatting. The extension interprets the dictated text and applies the requested action.

### Trial and privacy

- **REQ-TRIAL-1:** Judges should be able to try the extension without connecting multiple services or providing AWS credentials.
- **REQ-TRIAL-2:** The no-login allowance is 25 AI requests per extension installation, with a shared daily service cap. The sidebar shows the server-reported remaining installation allowance.
- **REQ-PRIVACY-1:** Users must be told when dictated email content is sent for processing.
- **REQ-PRIVACY-2:** Email contents should not be retained after processing unless the user explicitly chooses to save them.
- **REQ-PRIVACY-3:** Any AI service credentials must remain outside the browser extension.

## 6. Demo requirements

The two-minute demo should tell one connected story: **speak an email, then polish it by voice.**

- **First minute:** In Gmail, hold Fn and dictate a recipient, subject, and message. Show FlowDraft routing them into the correct fields, then review the draft.
- **Second minute:** In that same dictation, say “Hey Wispr” and ask to format the heading or an exact phrase. Show the formatted result and explain how unclear targets are handled.
- The demo may claim support for another mail app only after that app has been implemented and tested. Gmail is the initial target; Outlook and Apple Mail are possible later targets, not current support commitments.

## 7. Scope boundaries

### Initial scope

- One browser extension.
- One supported email app for the first working version, with Gmail as the proposed target.
- Voice-dictated recipient, subject, and message body.
- A small, explicit set of voice formatting commands for the message body.
- A user review step before sending.
- Automatic focus of new blank Gmail composers for Flow-based dictation.
- Inline formatting requests introduced by “Hey Wispr” in the same dictation.

### Not in the initial scope

- Automatically sending email.
- Claiming universal support for Gmail, Outlook, Apple Mail, and other clients before testing each one.
- Google Docs or general-purpose document editing.
- Microphone access, audio capture, or an always-listening assistant. The extension processes only text inserted by Wispr Flow.
- Unbounded AI access or unlimited free usage.

## 8. Product principles

- **One setup:** The judge should install the extension once and use the mail app they already have open.
- **User stays in control:** The extension prepares and edits a draft; the user decides whether to send it.
- **Be explicit:** “Hey Wispr” marks a formatting instruction; other dictated words remain email content.
- **Do not guess silently:** Ask when recipients, targets, or formatting scope are unclear.
- **Show real support honestly:** Only describe integrations and commands that have been tested.

## 9. Open decisions

- Live verification is still needed to confirm Wispr Flow inserts dictated text through a paste event in the supported Gmail/Chrome setup.
- Which additional mail apps, if any, should be supported after the Gmail release?
- Should later mail-app support use a separate integration for each app, or a more general draft handoff?

## 10. Success criteria

- A first-time judge can install the extension and understand how to try it without connecting several services.
- A dictated email is separated into the correct recipient, subject, and body fields in the supported mail app.
- The user can issue at least one useful formatting command through Wispr Flow and see the correct text change.
- Ambiguous recipients or formatting targets are surfaced instead of guessed.
- The user reviews and sends the email manually.
- The two-minute demo makes the problem, Wispr Flow’s role, and the resulting benefit clear.
