import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDependencies } from '../src/types.js';
import { normalizeEmailResult, normalizeFormatResult } from '../src/schemas.js';

const install = '3bd75295-8374-4ad9-9b66-522437a589bf';
const email = { recipient: 'sam@example.com', subject: 'Update', body: 'Hi Sam', clarification: null };

function dependencies(overrides: Partial<AppDependencies> = {}) {
  const usage = { reserve: vi.fn(async () => 1) };
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
});

describe('email parsing route', () => {
  it('validates and returns a structured draft without retaining the transcript', async () => {
    const { deps, model } = dependencies();
    const app = buildApp(deps);
    const response = await app.inject({ method: 'POST', url: '/v1/email/parse', payload: { installationId: install, transcript: 'To sam@example.com, subject update, message hi Sam' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ...email, requestsRemaining: 24 });
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

  it('does not call Bedrock if the trial is exhausted', async () => {
    const { deps, model } = dependencies({ usage: { reserve: vi.fn(async () => null) } });
    const app = buildApp(deps);
    const response = await app.inject({ method: 'POST', url: '/v1/email/parse', payload: { installationId: install, transcript: 'To sam@example.com, subject update, message hi Sam' } });
    expect(response.statusCode).toBe(429);
    expect(model.invoke).not.toHaveBeenCalled();
    await app.close();
  });

  it('does not use quota when model preflight fails before a Bedrock call', async () => {
    const usage = { reserve: vi.fn(async () => 1) };
    const model = { preflight: vi.fn(async () => { throw new Error('credentials missing'); }), invoke: vi.fn(async () => email) };
    const app = buildApp({ usage, model });
    const response = await app.inject({ method: 'POST', url: '/v1/email/parse', payload: { installationId: install, transcript: 'To sam@example.com, subject update, message hi Sam' } });
    expect(response.statusCode).toBe(503);
    expect(usage.reserve).not.toHaveBeenCalled();
    expect(model.invoke).not.toHaveBeenCalled();
    await app.close();
  });

  it('keeps concurrent requests within the 25-call allowance', async () => {
    let used = 0;
    const usage = { reserve: vi.fn(async () => { if (used >= 25) return null; used += 1; return used; }) };
    const model = { invoke: vi.fn(async () => email) };
    const app = buildApp({ usage, model });
    const responses = await Promise.all(Array.from({ length: 40 }, () => app.inject({
      method: 'POST', url: '/v1/email/parse', payload: { installationId: install, transcript: 'To sam@example.com, subject update, message hi Sam' },
    })));
    expect(responses.filter((response) => response.statusCode === 200)).toHaveLength(25);
    expect(responses.filter((response) => response.statusCode === 429)).toHaveLength(15);
    expect(model.invoke).toHaveBeenCalledTimes(25);
    await app.close();
  });

  it('counts an attempted Bedrock request if the model call fails', async () => {
    const usage = { reserve: vi.fn(async () => 2) };
    const model = { invoke: vi.fn(async () => { throw new Error('offline'); }) };
    const app = buildApp({ usage, model });
    const response = await app.inject({ method: 'POST', url: '/v1/email/parse', payload: { installationId: install, transcript: 'To sam@example.com, subject update, message hi Sam' } });
    expect(response.statusCode).toBe(502);
    expect(usage.reserve).toHaveBeenCalledOnce();
    await app.close();
  });
});
