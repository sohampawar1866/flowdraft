import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDependencies, UsageReservation } from '../src/types.js';
import { normalizeEmailResult, normalizeFormatResult, normalizeVoiceResult } from '../src/schemas.js';

const install = '3bd75295-8374-4ad9-9b66-522437a589bf';
const email = { recipient: 'sam@example.com', subject: 'Update', body: 'Hi Sam', clarification: null };
const formatting = { action: 'bold', target: { kind: 'last-paragraph' }, clarification: null };
const reserved = (installationRequestsUsed = 1) => ({ status: 'reserved' as const, installationRequestsUsed });

function dependencies(overrides: Partial<AppDependencies> = {}) {
  const usage = { reserve: vi.fn(async () => reserved()) };
  const model = { invoke: vi.fn(async () => email) };
  return { deps: { usage, model, ...overrides } as AppDependencies, usage, model };
}

afterEach(() => { delete process.env.BEDROCK_MODEL_ID; });

describe('safe model result normalization', () => {
  it('asks for clarification instead of accepting a recipient without an email address', () => {
    expect(normalizeEmailResult({ recipient: 'Soham', subject: 'Update', body: 'Hello', clarification: null })).toMatchObject({
      recipient: null,
      clarification: 'Please dictate the recipient’s complete email address.',
    });
  });

  it('asks for missing required email fields instead of returning an empty draft', () => {
    expect(normalizeEmailResult({ recipient: null, subject: 'Update', body: null, clarification: null })).toMatchObject({
      recipient: null,
      body: null,
      clarification: 'Please clarify the recipient email address, message.',
    });
  });

  it('normalizes a structured command to a safe last-paragraph target', () => {
    expect(normalizeFormatResult({ action: 'bold', target: { kind: 'last-paragraph', text: null, all: false }, clarification: null })).toEqual({
      action: 'bold', target: { kind: 'last-paragraph' }, clarification: null,
    });
  });

  it('normalizes voice email fields and inline command targets', () => {
    expect(normalizeVoiceResult({
      recipient: 'sam@example.com', subject: 'Update', body: 'Quarterly update',
      formatting: [{ action: 'bold', target: { kind: 'phrase', text: 'Quarterly update', all: false } }],
      clarification: null,
    })).toMatchObject({ recipient: 'sam@example.com', formatting: [{ action: 'bold', target: { text: 'Quarterly update' } }] });
  });

  it('rejects a response that leaves the reserved voice marker in the final body', () => {
    expect(normalizeVoiceResult({
      recipient: 'sam@example.com', subject: 'Update', body: 'Hey Wispr make that bold',
      formatting: [], clarification: null,
    })).toBeNull();
  });
});

describe('AI routes and shared quota', () => {
  const emailRequest = { installationId: install, transcript: 'To sam@example.com, subject update, message hi Sam' };

  it('validates and returns a structured draft without retaining the transcript', async () => {
    const { deps, model } = dependencies();
    const app = buildApp(deps);
    const response = await app.inject({ method: 'POST', url: '/v1/email/parse', payload: emailRequest });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ...email, requestsRemaining: 24 });
    expect(model.invoke).toHaveBeenCalledOnce();
    await app.close();
  });

  it('returns the authoritative installation allowance without calling Bedrock', async () => {
    const { deps, usage, model } = dependencies({ usage: {
      reserve: vi.fn(async () => reserved()),
      getRemaining: vi.fn(async () => 17),
    } });
    const app = buildApp(deps);
    const response = await app.inject({ method: 'GET', url: `/v1/usage?installationId=${install}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ requestsRemaining: 17 });
    expect(usage.reserve).not.toHaveBeenCalled();
    expect(model.invoke).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an invalid installation ID on the usage endpoint', async () => {
    const { deps } = dependencies();
    const app = buildApp(deps);
    const response = await app.inject({ method: 'GET', url: '/v1/usage?installationId=bad' });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('parses a whole email and inline formatting in one reserved model request', async () => {
    const voiceResult = {
      recipient: 'sam@example.com', subject: 'Update', body: 'Quarterly update\nThe launch is Friday.',
      formatting: [{ action: 'bold', target: { kind: 'phrase', text: 'Quarterly update', all: false } }],
      clarification: null,
    };
    const model = { invoke: vi.fn(async () => voiceResult) };
    const { deps, usage } = dependencies({ model });
    const app = buildApp(deps);
    const response = await app.inject({
      method: 'POST', url: '/v1/voice/parse',
      payload: { installationId: install, transcript: 'To sam@example.com. Subject update. Message Quarterly update. Hey Wispr make that heading bold. The launch is Friday.' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ...voiceResult, requestsRemaining: 24 });
    expect(usage.reserve).toHaveBeenCalledOnce();
    expect(model.invoke).toHaveBeenCalledOnce();
    await app.close();
  });

  it('rejects malformed input before quota reservation or Bedrock', async () => {
    const { deps, usage, model } = dependencies();
    const app = buildApp(deps);
    const response = await app.inject({ method: 'POST', url: '/v1/email/parse', payload: { installationId: 'nope', transcript: '' } });
    expect(response.statusCode).toBe(400);
    expect(usage.reserve).not.toHaveBeenCalled();
    expect(model.invoke).not.toHaveBeenCalled();
    await app.close();
  });

  it('preserves the per-installation exhaustion response and does not call Bedrock', async () => {
    const { deps, model } = dependencies({ usage: { reserve: vi.fn(async () => ({ status: 'installation_limit' as const })) } });
    const app = buildApp(deps);
    const response = await app.inject({ method: 'POST', url: '/v1/email/parse', payload: emailRequest });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ error: expect.stringContaining('25 free AI requests'), requestsRemaining: 0 });
    expect(model.invoke).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns a clear daily-limit response and Retry-After without calling Bedrock', async () => {
    const { deps, model } = dependencies({ usage: { reserve: vi.fn(async () => ({ status: 'daily_limit' as const, retryAfterSeconds: 1234 })) } });
    const app = buildApp(deps);
    const response = await app.inject({ method: 'POST', url: '/v1/email/parse', payload: emailRequest });
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('1234');
    expect(response.json()).toMatchObject({ code: 'DAILY_LIMIT_REACHED', error: expect.stringContaining('00:00 UTC') });
    expect(model.invoke).not.toHaveBeenCalled();
    await app.close();
  });

  it('fails closed on a usage database error', async () => {
    const { deps, model } = dependencies({ usage: { reserve: vi.fn(async () => { throw new Error('database offline'); }) } });
    const app = buildApp(deps);
    const response = await app.inject({ method: 'POST', url: '/v1/email/parse', payload: emailRequest });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toContain('No AI request was made');
    expect(model.invoke).not.toHaveBeenCalled();
    await app.close();
  });

  it('does not use quota when model preflight fails before a Bedrock call', async () => {
    const usage = { reserve: vi.fn(async () => reserved()) };
    const model = { preflight: vi.fn(async () => { throw new Error('credentials missing'); }), invoke: vi.fn(async () => email) };
    const app = buildApp({ usage, model });
    const response = await app.inject({ method: 'POST', url: '/v1/email/parse', payload: emailRequest });
    expect(response.statusCode).toBe(503);
    expect(usage.reserve).not.toHaveBeenCalled();
    expect(model.invoke).not.toHaveBeenCalled();
    await app.close();
  });

  it('keeps concurrent requests within the 25-call installation allowance', async () => {
    let used = 0;
    const usage = { reserve: vi.fn(async () => { if (used >= 25) return { status: 'installation_limit' as const }; used += 1; return reserved(used); }) };
    const model = { invoke: vi.fn(async () => email) };
    const app = buildApp({ usage, model });
    const responses = await Promise.all(Array.from({ length: 40 }, () => app.inject({ method: 'POST', url: '/v1/email/parse', payload: emailRequest })));
    expect(responses.filter((response) => response.statusCode === 200)).toHaveLength(25);
    expect(responses.filter((response) => response.statusCode === 429)).toHaveLength(15);
    expect(model.invoke).toHaveBeenCalledTimes(25);
    await app.close();
  });

  it('shares a 500-request UTC daily cap across email and formatting under concurrent load', async () => {
    let dailyUsed = 0;
    const installationUsage = new Map<string, number>();
    const usage = {
      reserve: vi.fn(async (installationId: string): Promise<UsageReservation> => {
        const used = installationUsage.get(installationId) ?? 0;
        if (used >= 25) return { status: 'installation_limit' };
        if (dailyUsed >= 500) return { status: 'daily_limit', retryAfterSeconds: 60 };
        installationUsage.set(installationId, used + 1);
        dailyUsed += 1;
        return reserved(used + 1);
      }),
    };
    const model = { invoke: vi.fn(async ({ toolName }: { toolName: string }) => toolName === 'email_fields' ? email : formatting) };
    const app = buildApp({ usage, model }, { rateLimitMax: 1000 });
    const requests = Array.from({ length: 501 }, (_, i) => ({
      method: 'POST' as const,
      url: i % 2 === 0 ? '/v1/email/parse' : '/v1/format/parse',
      payload: i % 2 === 0
        ? { installationId: crypto.randomUUID(), transcript: emailRequest.transcript }
        : { installationId: crypto.randomUUID(), instruction: 'Bold the line I just spoke' },
    }));
    const responses = await Promise.all(requests.map((request) => app.inject(request)));
    expect(responses.filter((response) => response.statusCode === 200)).toHaveLength(500);
    expect(responses.filter((response) => response.statusCode === 429)).toHaveLength(1);
    expect(model.invoke).toHaveBeenCalledTimes(500);
    expect(usage.reserve).toHaveBeenCalledTimes(501);
    await app.close();
  });

  it('counts an attempted Bedrock request if the model call fails', async () => {
    const usage = { reserve: vi.fn(async () => reserved(2)) };
    const model = { invoke: vi.fn(async () => { throw new Error('offline'); }) };
    const app = buildApp({ usage, model });
    const response = await app.inject({ method: 'POST', url: '/v1/email/parse', payload: emailRequest });
    expect(response.statusCode).toBe(502);
    expect(usage.reserve).toHaveBeenCalledOnce();
    await app.close();
  });
});
