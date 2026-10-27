# Project Requirements: Voice-First Email Composer

**Status:** Draft concept requirements
**Hackathon:** WeMakeDevs × Wispr Flow
**Working name:** TBD
**Current focus:** Gmail compose and voice-based message formatting

## 1. Product idea

Build a small browser extension that helps people compose and polish an email with Wispr Flow. A user dictates the recipient, subject, and message in one pass. The extension sorts the words into the right email fields. The user can then give a separate voice command to format a line or phrase in the message body.

The extension makes Wispr Flow useful for more than entering a block of text: the user can speak both the content and what should happen to it.

## 2. Problem

Dictating an email into one field is easy, but composing a complete email often means switching between recipient, subject, and message fields. Voice dictation also enters formatting instructions as words unless the user has a clear way to issue them as commands. This project should let the user speak a complete email, review its structure, and make simple formatting changes by voice.

## 3. Intended users

- People who prefer speaking to typing or have difficulty using a keyboard.
- People who draft many short emails and want to dictate the whole draft naturally.
- Wispr Flow users who want spoken instructions to change their email, not just appear as text in it.

## 4. Main user journey

1. The user installs the extension and opens Gmail.
2. The user opens a new message and starts the extension’s compose flow.
3. Using Wispr Flow, the user dictates a message containing the recipient, subject, and body.
4. The extension places each part in the corresponding Gmail field and shows the draft for review.
5. The user selects a formatting-command mode and dictates an instruction, such as “bold the line I just spoke” or “bold every ‘Report Card’ in this message.”
6. The extension applies the requested change to the message body. If the target is unclear, it asks the user to choose rather than guessing.
7. The user reviews and sends the email themselves.

## 5. Functional requirements

### Email composition

- **REQ-EMAIL-1:** A user must be able to dictate the recipient, subject, and message body in one composition flow.
- **REQ-EMAIL-2:** The extension must identify the three parts and place them in the matching fields in the initial supported mail app.
- **REQ-EMAIL-3:** The user must be able to inspect and correct the fields before sending.
- **REQ-EMAIL-4:** The extension must never send an email without the user’s explicit action in the mail app.
- **REQ-EMAIL-5:** If the recipient or another required part cannot be understood, the extension must ask for clarification and must not silently guess.

### Voice formatting

- **REQ-FORMAT-1:** The user must have a clear way to enter formatting-command mode, separate from ordinary email dictation.
- **REQ-FORMAT-2:** The initial command set should focus on simple message-body formatting, such as bold, italic, alignment, and lists. The exact first-release commands remain to be selected.
- **REQ-FORMAT-3:** The user must be able to refer to the most recently dictated line or paragraph, an exact phrase already in the body, or all occurrences of an exact phrase.
- **REQ-FORMAT-4:** Commands such as “bold every ‘Report Card’” must apply to all matching text in the message body. A request without “every” must not silently change multiple matches; the extension should ask which occurrence the user means.
- **REQ-FORMAT-5:** Formatting commands must not change the recipient or subject fields.
- **REQ-FORMAT-6:** The extension must show the user what it changed and allow a correction or undo where practical.

### Wispr Flow use

- **REQ-FLOW-1:** Wispr Flow must be the voice-input method used in the demonstrated workflow.
- **REQ-FLOW-2:** The user should dictate into a clearly identified extension input or command mode so spoken instructions are not accidentally inserted into the email body.
- **REQ-FLOW-3:** The product must not claim that Wispr Flow itself parses email fields or performs formatting. The extension interprets the dictated text and applies the requested action.

### Trial and privacy

- **REQ-TRIAL-1:** Judges should be able to try the extension without connecting multiple services or providing AWS credentials.
- **REQ-TRIAL-2:** The proposed no-login trial allowance is approximately 20–30 email drafts per user. The exact limit and how a user is identified are open decisions.
- **REQ-PRIVACY-1:** Users must be told when dictated email content is sent for processing.
- **REQ-PRIVACY-2:** Email contents should not be retained after processing unless the user explicitly chooses to save them.
- **REQ-PRIVACY-3:** Any AI service credentials must remain outside the browser extension.

## 6. Demo requirements

The two-minute demo should tell one connected story: **speak an email, then polish it by voice.**

- **First minute:** In Gmail, dictate a recipient, subject, and message. Show the extension placing them into the correct fields, then review the draft.
- **Second minute:** Issue a formatting command for a line just dictated or an exact phrase in the body. Show the result and explain how ambiguous targets are handled.
- The demo may claim support for another mail app only after that app has been implemented and tested. Gmail is the initial target; Outlook and Apple Mail are possible later targets, not current support commitments.

## 7. Scope boundaries

### Initial scope

- One browser extension.
- One supported email app for the first working version, with Gmail as the proposed target.
- Voice-dictated recipient, subject, and message body.
- A small, explicit set of voice formatting commands for the message body.
- A user review step before sending.

### Not in the initial scope

- Automatically sending email.
- Claiming universal support for Gmail, Outlook, Apple Mail, and other clients before testing each one.
- Google Docs or general-purpose document editing.
- A wake word or always-listening assistant.
- Unbounded AI access or unlimited free usage.

## 8. Product principles

- **One setup:** The judge should install the extension once and use the mail app they already have open.
- **User stays in control:** The extension prepares and edits a draft; the user decides whether to send it.
- **Be explicit:** The user can tell whether they are dictating email content or issuing a formatting command.
- **Do not guess silently:** Ask when recipients, targets, or formatting scope are unclear.
- **Show real support honestly:** Only describe integrations and commands that have been tested.

## 9. Open decisions

- Which browser and Gmail experience will be supported first (for example, Gmail in Chrome)?
- What exact spoken format should separate recipient, subject, and body while still feeling natural?
- Which formatting commands are reliable and useful enough for the first demo?
- Should formatting commands use a dedicated extension command box, a visible mode switch, or another clear interaction?
- Is Bedrock needed for natural-language field extraction, or can the first version use a constrained parser?
- What exact trial limit should be used, and what no-login mechanism should track it? IP address alone should not be treated as a reliable person identifier.
- Should later mail-app support use a separate integration for each app, or a more general draft handoff?

## 10. Success criteria

- A first-time judge can install the extension and understand how to try it without connecting several services.
- A dictated email is separated into the correct recipient, subject, and body fields in the supported mail app.
- The user can issue at least one useful formatting command through Wispr Flow and see the correct text change.
- Ambiguous recipients or formatting targets are surfaced instead of guessed.
- The user reviews and sends the email manually.
- The two-minute demo makes the problem, Wispr Flow’s role, and the resulting benefit clear.
