import type { FormatParseResult, VoiceParseResult } from './api';

export type EmailDraft = { recipient: string; subject: string; body: string };
export type ListComposeMessage = { type: 'LIST_COMPOSES' };
export type FillDraftMessage = { type: 'FILL_DRAFT'; composeIndex: number; draft: EmailDraft };
export type ApplyFormatMessage = { type: 'APPLY_FORMAT'; composeIndex: number; format: FormatParseResult; occurrenceIndex?: number };
export type CapturedDictationMessage = { type: 'DICTATION_CAPTURED'; composeId: string; transcript: string };
export type ApplyVoiceResultMessage = { type: 'APPLY_VOICE_RESULT'; composeId: string; transcript: string; result: VoiceParseResult };
export type VoiceStatusMessage = { type: 'VOICE_STATUS'; status: 'processing' | 'success' | 'clarification' | 'error'; text: string; requestsRemaining?: number };

export type ComposeWindow = { index: number; recipient: string; subject: string; active: boolean };
export type ComposeResult = { ok: true; message?: string } | { ok: false; reason: string; matches?: Array<{ index: number; excerpt: string }> };
