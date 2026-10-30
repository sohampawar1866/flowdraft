import { z } from 'zod';

export const emailRequestSchema = z.object({
  installationId: z.uuid(),
  transcript: z.string().trim().min(8).max(12000),
}).strict();

export const formatRequestSchema = z.object({
  installationId: z.uuid(),
  instruction: z.string().trim().min(3).max(1000),
}).strict();

export const emailResultSchema = z.object({
  recipient: z.string().trim().max(254).nullable(),
  subject: z.string().trim().max(998).nullable(),
  body: z.string().max(10000).nullable(),
  clarification: z.string().trim().max(500).nullable(),
});

export const voiceRequestSchema = z.object({
  installationId: z.uuid(),
  transcript: z.string().trim().min(8).max(12000),
}).strict();

export const formatResultSchema = z.object({
  action: z.enum(['bold', 'italic', 'center', 'bullets']),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('last-paragraph') }).strict(),
    z.object({ kind: z.literal('phrase'), text: z.string().trim().min(1).max(160), all: z.boolean() }).strict(),
  ]),
  clarification: z.string().trim().max(500).nullable(),
});

export const voiceResultSchema = z.object({
  recipient: z.string().trim().max(254).nullable(),
  subject: z.string().trim().max(998).nullable(),
  body: z.string().max(10000).nullable(),
  formatting: z.array(z.object({
    action: z.enum(['bold', 'italic', 'center', 'bullets']),
    target: z.object({ kind: z.literal('phrase'), text: z.string().trim().min(1).max(160), all: z.boolean() }).strict(),
  }).strict()).max(8),
  clarification: z.string().trim().max(500).nullable(),
});

export type EmailResult = z.infer<typeof emailResultSchema>;
export type FormatResult = z.infer<typeof formatResultSchema>;
export type VoiceResult = z.infer<typeof voiceResultSchema>;

function capitalizeSubjectStart(subject: string | null): string | null {
  if (!subject) return subject;
  const firstLetter = /\p{L}/u.exec(subject);
  if (!firstLetter || firstLetter.index === undefined) return subject;
  const index = firstLetter.index;
  return subject.slice(0, index) + firstLetter[0].toUpperCase() + subject.slice(index + firstLetter[0].length);
}

export function normalizeEmailResult(value: unknown): EmailResult | null {
  const parsed = emailResultSchema.safeParse(value);
  if (!parsed.success) return null;
  let result = { ...parsed.data, subject: capitalizeSubjectStart(parsed.data.subject) };
  if (result.recipient && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.recipient)) {
    result = { ...result, recipient: null, clarification: result.clarification ?? 'Please dictate the recipient’s complete email address.' };
  }
  const missing: string[] = [];
  if (!result.recipient) missing.push('recipient email address');
  if (!result.subject) missing.push('subject');
  if (!result.body) missing.push('message');
  if (missing.length && !result.clarification) {
    result = { ...result, clarification: `Please clarify the ${missing.join(', ')}.` };
  }
  return result;
}

export function normalizeFormatResult(value: unknown): FormatResult | null {
  if (typeof value !== 'object' || value === null || !('target' in value)) return null;
  const raw = value as { target?: unknown };
  if (typeof raw.target !== 'object' || raw.target === null || !('kind' in raw.target)) return null;
  const target = raw.target as { kind?: unknown; text?: unknown; all?: unknown };
  const normalizedTarget = target.kind === 'last-paragraph'
    ? { kind: 'last-paragraph' }
    : target.kind === 'phrase' && typeof target.text === 'string'
      ? { kind: 'phrase', text: target.text, all: target.all === true }
      : null;
  if (!normalizedTarget) return null;
  const parsed = formatResultSchema.safeParse({ ...(value as object), target: normalizedTarget });
  return parsed.success ? parsed.data : null;
}

export function normalizeVoiceResult(value: unknown, transcript: string): VoiceResult | null {
  const parsed = voiceResultSchema.safeParse(value);
  if (!parsed.success) return null;
  let result = {
    ...parsed.data,
    recipient: parsed.data.recipient?.trim() || null,
    subject: capitalizeSubjectStart(parsed.data.subject?.trim() || null),
    body: parsed.data.body?.trim() || null,
  };
  if (/\bhey\s+wispr(?:\s+flow)?\b/i.test(result.body ?? '')) {
    result = {
      ...result,
      body: null,
      clarification: result.clarification ?? 'I could not safely separate the formatting command from the message. Please repeat the dictation with “Hey Wispr” or “Hey Wispr Flow” before the command.',
    };
  }
  if (result.recipient && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.recipient)) {
    result = { ...result, recipient: null, clarification: result.clarification ?? 'Please dictate the recipient’s complete email address.' };
  }
  const transcriptAddresses = Array.from(new Set(
    Array.from(transcript.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi), (match) => match[0].toLowerCase()),
  ));
  if (transcriptAddresses.length !== 1 || !result.recipient
    || transcriptAddresses[0] !== result.recipient.toLowerCase()) {
    result = {
      ...result,
      recipient: null,
      clarification: result.clarification ?? (transcriptAddresses.length > 1
        ? 'Please dictate one clear recipient email address.'
        : 'Please dictate the recipient’s complete email address.'),
    };
  }
  const missing: string[] = [];
  if (!result.recipient) missing.push('recipient email address');
  if (!result.subject) missing.push('subject');
  if (!result.body) missing.push('message');
  if (missing.length && !result.clarification) result = { ...result, clarification: `Please clarify the ${missing.join(', ')}.` };
  return result;
}

export const emailToolSchema: Record<string, unknown> = {
  type: 'object', additionalProperties: false,
  properties: {
    recipient: { type: ['string', 'null'], description: 'Exactly one recipient email address, or null if missing/unclear.' },
    subject: { type: ['string', 'null'], description: 'Email subject, or null if missing/unclear.' },
    body: { type: ['string', 'null'], description: 'Only the message body, with paragraph breaks preserved, or null if missing/unclear.' },
    clarification: { type: ['string', 'null'], description: 'A short question to resolve missing/unclear required details, otherwise null.' },
  }, required: ['recipient', 'subject', 'body', 'clarification'],
};

export const formatToolSchema: Record<string, unknown> = {
  type: 'object', additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['bold', 'italic', 'center', 'bullets'] },
    target: {
      type: 'object', additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['last-paragraph', 'phrase'] },
        text: { type: ['string', 'null'], description: 'Exact target phrase. Null for last-paragraph.' },
        all: { type: 'boolean', description: 'True only when the user explicitly requests every/all occurrences.' },
      }, required: ['kind', 'text', 'all'],
    },
    clarification: { type: ['string', 'null'] },
  }, required: ['action', 'target', 'clarification'],
};

export const voiceToolSchema: Record<string, unknown> = {
  type: 'object', additionalProperties: false,
  properties: {
    recipient: { type: ['string', 'null'], description: 'One complete recipient email address, or null if missing or unclear.' },
    subject: { type: ['string', 'null'], description: 'The email subject, or null if missing or unclear.' },
    body: { type: ['string', 'null'], description: 'Email body only. Exclude all Hey Wispr markers and their spoken formatting instructions. Preserve wording and paragraph breaks.' },
    formatting: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          action: { type: 'string', enum: ['bold', 'italic', 'center', 'bullets'] },
          target: {
            type: 'object', additionalProperties: false,
            properties: {
              kind: { type: 'string', enum: ['phrase'] },
              text: { type: 'string', description: 'Exact body text to format; use the exact preceding heading/line when a command says “what I just said”.' },
              all: { type: 'boolean', description: 'True only when every/all occurrences are explicitly requested.' },
            }, required: ['kind', 'text', 'all'],
          },
        }, required: ['action', 'target'],
      },
    },
    clarification: { type: ['string', 'null'], description: 'Ask for missing or unclear email fields, or explain unclear formatting.' },
  }, required: ['recipient', 'subject', 'body', 'formatting', 'clarification'],
};
