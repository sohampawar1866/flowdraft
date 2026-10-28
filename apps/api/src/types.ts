export type UsageReservation =
  | { status: 'reserved'; installationRequestsUsed: number }
  | { status: 'installation_limit' }
  | { status: 'daily_limit'; retryAfterSeconds: number };

export interface UsageStore {
  reserve(installationId: string): Promise<UsageReservation>;
  getRemaining(installationId: string): Promise<number>;
}

export interface ModelInvoker {
  preflight?(): Promise<void>;
  invoke(input: { system: string; prompt: string; schema: Record<string, unknown>; toolName: string }): Promise<unknown>;
}

export interface AppDependencies {
  usage: UsageStore;
  model: ModelInvoker;
}
