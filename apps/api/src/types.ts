export interface UsageStore {
  reserve(installationId: string): Promise<number | null>;
}

export interface ModelInvoker {
  preflight?(): Promise<void>;
  invoke(input: { system: string; prompt: string; schema: Record<string, unknown>; toolName: string }): Promise<unknown>;
}

export interface AppDependencies {
  usage: UsageStore;
  model: ModelInvoker;
}
