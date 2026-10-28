import { z } from 'zod';

export const EmailParseResponse = z.object({
  recipient: z.string().nullable(),
  subject: z.string().nullable(),
  body: z.string().nullable(),
  clarification: z.string().nullable(),
  requestsRemaining: z.number().int().min(0),
});

export const InlineFormatCommand = z.object({
  action: z.enum(['bold', 'italic', 'center', 'bullets']),
  target: z.object({ kind: z.literal('phrase'), text: z.string().min(1).max(160), all: z.boolean() }),
});

export const VoiceParseResponse = z.object({
  recipient: z.string().nullable(),
  subject: z.string().nullable(),
  body: z.string().nullable(),
  formatting: z.array(InlineFormatCommand).max(8),
  clarification: z.string().nullable(),
  requestsRemaining: z.number().int().min(0),
});

export const UsageResponse = z.object({ requestsRemaining: z.number().int().min(0).max(25) });

export const FormatParseResponse = z.object({
  action: z.enum(['bold', 'italic', 'center', 'bullets']),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('last-paragraph') }),
    z.object({ kind: z.literal('phrase'), text: z.string().min(1).max(160), all: z.boolean() }),
  ]),
  clarification: z.string().nullable(),
  requestsRemaining: z.number().int().min(0),
});

export type EmailParseResponse = z.infer<typeof EmailParseResponse>;
export type FormatParseResponse = z.infer<typeof FormatParseResponse>;
export type InlineFormatCommand = z.infer<typeof InlineFormatCommand>;
export type VoiceParseResponse = z.infer<typeof VoiceParseResponse>;
export type UsageResponse = z.infer<typeof UsageResponse>;
