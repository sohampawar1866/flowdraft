import type { VoiceParseResult } from './api';

export type CapturedDictationMessage = { type: 'DICTATION_CAPTURED'; composeId: string; transcript: string };
export type ApplyVoiceResultMessage = { type: 'APPLY_VOICE_RESULT'; composeId: string; transcript: string; result: VoiceParseResult };
export type VoiceStatusMessage = { type: 'VOICE_STATUS'; status: 'processing' | 'success' | 'clarification' | 'error'; text: string; requestsRemaining?: number; composeId?: string };

export type ComposeResult = { ok: true; message?: string } | { ok: false; reason: string; matches?: Array<{ index: number; excerpt: string }> };
