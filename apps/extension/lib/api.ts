import { EmailParseResponse, FormatParseResponse, UsageResponse, VoiceParseResponse, type EmailParseResponse as EmailParseResult, type FormatParseResponse as FormatParseResult, type VoiceParseResponse as VoiceParseResult } from '@flowdraft/contracts';
import { z } from 'zod';

declare const __WISPR_API_BASE_URL__: string;

export { EmailParseResponse, FormatParseResponse } from '@flowdraft/contracts';
export { VoiceParseResponse, UsageResponse } from '@flowdraft/contracts';
export type { EmailParseResult, FormatParseResult, VoiceParseResult };

export class ApiRequestError extends Error {
  constructor(message: string, readonly requestsRemaining?: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const API_BASE = typeof __WISPR_API_BASE_URL__ === 'string'
  ? __WISPR_API_BASE_URL__
  : 'https://wispr-voice-email-api.onrender.com';

async function post<T>(path: string, body: object, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = z.object({ error: z.string().optional(), requestsRemaining: z.number().optional() }).safeParse(payload);
    throw new ApiRequestError(
      error.success ? error.data.error ?? `Request failed (${response.status})` : `Request failed (${response.status})`,
      error.success ? error.data.requestsRemaining : undefined,
    );
  }
  return schema.parse(payload);
}

export const api = {
  parseEmail: (installationId: string, transcript: string) =>
    post('/v1/email/parse', { installationId, transcript }, EmailParseResponse),
  parseFormat: (installationId: string, instruction: string) =>
    post('/v1/format/parse', { installationId, instruction }, FormatParseResponse),
  parseVoice: (installationId: string, transcript: string) =>
    post('/v1/voice/parse', { installationId, transcript }, VoiceParseResponse),
  getUsage: (installationId: string) =>
    fetch(`${API_BASE}/v1/usage?installationId=${encodeURIComponent(installationId)}`).then(async (response) => {
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error('Could not refresh your AI request allowance.');
      return UsageResponse.parse(payload);
    }),
};
