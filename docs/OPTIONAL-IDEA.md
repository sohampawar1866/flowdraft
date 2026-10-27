# Optional Hackathon Idea: Voice-First Incident Investigator

> **Status: fallback / last option.** Keep this idea parked while we discuss and evaluate other concepts for the Wispr Flow hackathon. Build it only if the other ideas do not work out.

## Project concept

A developer is paged about a failing service and needs to work out what changed, what the error evidence says, and what to do next. The project is a voice-first incident investigation tool: the developer asks questions with Wispr Flow, and the app investigates the incident using the connected project source and error evidence.

Possible working description: **“Ask your incident what changed. Get an answer tied to the code and error evidence.”** The name is undecided; avoid presenting this as a simple rebrand of the existing Beacon project.

## How Wispr Flow is central

The app has a focused question box. The developer uses Wispr Flow to dictate a question such as:

> “What changed before this error started? Show me the evidence and one safe next step.”

Flow types into the app, which sends the question and selected incident evidence to the backend. The app returns an explanation with links or references to the code change and error details. The user can dictate a follow-up or ask the app to prepare an incident handoff.

Flow is the voice-input method; the app does not claim that Flow itself reads logs, runs an agent, or executes fixes.

## Data and service connections

- **GitHub:** A “Connect GitHub” action on the platform page lets a user select a repository. Use a GitHub App with read-only access to selected repositories for source code and recent changes.
- **Error evidence / logs:** GitHub does not provide runtime logs. Start with a Sentry connection for error events and stack traces, with a paste-in field for log text from other systems. Choose one monitoring provider for the first real integration rather than trying to support every logging platform.
- **AI:** Call Amazon Bedrock from the app backend, using the project owner’s credits. Keep the Bedrock credential server-side; judges should not need AWS credentials.
- **Hosting:** Host the app/backend on Render. AWS is used for Bedrock inference only; no AWS infrastructure is required for hosting.
- **Sharing:** Slack is optional. Email can open a prefilled draft in the user’s mail app; automatic email sending would require an email provider or account connection.

## Judge experience

The judge should be able to open the project and try it without connecting personal services:

1. Click **Try demo incident** to load a prepared repository snapshot and error incident.
2. Dictate a question into the app with Wispr Flow, or type it if Flow is unavailable.
3. Receive a real Bedrock-generated answer grounded in the sample code and error evidence, with clear references to the supporting details.
4. Generate and copy an incident handoff.

The sample should use the same analysis path as a connected incident; it is an easy entry point, not a fixed scripted answer. The platform page should also offer **Connect GitHub** and, once implemented, **Connect Sentry** so a user can try their own project and incident.

## Demo story

“A service has started failing. I connect or select its repository, add the error incident, and ask Wispr Flow what changed before the errors began. The app checks the recent code changes against the error evidence, explains what it found, and prepares a handoff for the next engineer.”

## Scope and open questions

- Keep the first version read-only: explain, cite evidence, and suggest safe checks; do not automatically change code or deploy fixes.
- Confirm Sentry is the best first log/error source for the intended users; otherwise select one provider before implementation.
- Validate that incident investigation is a problem from the builder’s own work and that this idea offers enough distinction from existing on-call agents.
- Keep this as the **last-option project**, not the currently selected hackathon idea.
