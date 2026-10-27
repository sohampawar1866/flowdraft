import { describe, expect, it } from 'vitest';
import { FormatParseResponse } from './api';

describe('formatting result contract', () => {
  it('accepts only the supported formatting actions and target shapes', () => {
    expect(FormatParseResponse.safeParse({ action: 'bold', target: { kind: 'phrase', text: 'Report Card', all: true }, clarification: null, requestsRemaining: 3 }).success).toBe(true);
    expect(FormatParseResponse.safeParse({ action: 'delete', target: { kind: 'phrase', text: 'Report Card', all: true }, clarification: null, requestsRemaining: 3 }).success).toBe(false);
    expect(FormatParseResponse.safeParse({ action: 'bold', target: { kind: 'phrase', text: '', all: false }, clarification: null, requestsRemaining: 3 }).success).toBe(false);
  });
});
