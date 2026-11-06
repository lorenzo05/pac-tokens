export type Snapshot = {
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
}

declare module 'claude-code' {
  interface PluginState {
    'token-band': { snapshot: Snapshot | null; isHidden: boolean }
  }
}
