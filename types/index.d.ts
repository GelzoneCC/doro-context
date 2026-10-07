/** The live context window's fill, as `$.session.usage().context` reports it. */
export type DoroFill = { tokens?: number; window: number; percent?: number }

declare module 'claude-code' {
  interface PluginState {
    'doro-context': { fill: DoroFill | null }
  }
}
