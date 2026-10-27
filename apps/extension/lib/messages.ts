import type { FormatParseResult } from './api';

export type EmailDraft = { recipient: string; subject: string; body: string };
export type ListComposeMessage = { type: 'LIST_COMPOSES' };
export type FillDraftMessage = { type: 'FILL_DRAFT'; composeIndex: number; draft: EmailDraft };
export type ApplyFormatMessage = { type: 'APPLY_FORMAT'; composeIndex: number; format: FormatParseResult; occurrenceIndex?: number };

export type ComposeWindow = { index: number; recipient: string; subject: string; active: boolean };
export type ComposeResult = { ok: true; message?: string } | { ok: false; reason: string; matches?: Array<{ index: number; excerpt: string }> };
