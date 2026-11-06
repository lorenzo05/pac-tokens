export type Snapshot = {
  tokens: number | null
  window: number
  percent: number | null
  usd: number | null
  limits: { kind: string; percentUsed: number }[]
}

declare module 'claude-code' {
  interface PluginState {
    'token-band': { snapshot: Snapshot | null; isHidden: boolean; isPaneOpen: boolean }
  }
}
