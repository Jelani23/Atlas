// The standardized event vocabulary Atlas's backend speaks over the Electron
// bridge. The UI should only ever depend on these shapes — never on the
// names of backend files/functions that produced them.

export type AtlasEventType =
  | "user.message"
  | "atlas.thinking"
  | "atlas.tool_started"
  | "atlas.tool_progress"
  | "atlas.tool_completed"
  | "atlas.response"
  | "atlas.error"
  | "atlas.status"
  | "atlas.model_changed"

export interface AtlasEvent {
  type: AtlasEventType
  payload: Record<string, unknown>
}

export interface AtlasBridge {
  sendMessage: (text: string) => Promise<{ ok: boolean; reply?: string; error?: string }>
  getState: () => Promise<{ mode: string; sessionId: string | null; ready: boolean }>
  listModes: () => Promise<string[]>
  setMode: (mode: string) => Promise<{ ok: boolean; mode?: string; error?: string }>
  resetConversation: () => Promise<{ ok: boolean }>
  listConversations: () => Promise<import("./types").ConversationSummary[]>
  getConversation: (sessionId: string) => Promise<import("./types").StoredMessage[]>
  newConversation: () => Promise<{ ok: boolean; sessionId: string }>
  deleteConversation: (sessionId: string) => Promise<{ ok: boolean; newSessionId: string | null }>
  renameConversation: (sessionId: string, title: string) => Promise<{ ok: boolean; title: string | null }>
  onEvent: (callback: (event: AtlasEvent) => void) => () => void
}

declare global {
  interface Window {
    atlasBridge?: AtlasBridge
  }
}
