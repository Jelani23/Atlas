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
  // One LLM token, streamed live as the backend generates it (payload: { token: string }).
  | "atlas.streaming"
  | "atlas.screen_captured"

export interface AtlasEvent {
  type: AtlasEventType
  payload: Record<string, unknown>
}

export interface AtlasBridge {
  sendMessage: (text: string, options?: { transcriptionId?: string; screenDisplayId?: string }) => Promise<{ ok: boolean; reply?: string; error?: string }>
  listScreens: () => Promise<ScreenInventory>
  getClientDevice: () => Promise<{ connectionId: string; inputSource: string; client: null | {
    schemaVersion: number; deviceId: string; displayName: string; os: string;
    clientType: string; deviceKind: string; trust: 'self-reported';
    capabilities: Record<string, { supported: boolean; permission: string }>;
  } }>
  getState: () => Promise<{ mode: string; sessionId: string | null; ready: boolean }>
  listModes: () => Promise<string[]>
  setMode: (mode: string) => Promise<{ ok: boolean; mode?: string; error?: string }>
  resetConversation: () => Promise<{ ok: boolean }>
  listConversations: () => Promise<import("./types").ConversationSummary[]>
  getConversation: (sessionId: string) => Promise<import("./types").StoredMessage[]>
  newConversation: () => Promise<{ ok: boolean; sessionId: string }>
  resumeConversation: (sessionId: string) => Promise<{ ok: boolean; sessionId: string }>
  deleteConversation: (sessionId: string) => Promise<{ ok: boolean; newSessionId: string | null }>
  renameConversation: (sessionId: string, title: string) => Promise<{ ok: boolean; title: string | null }>
  onEvent: (callback: (event: AtlasEvent) => void) => () => void
}

export interface ScreenInventory {
  selectedDisplayId?: string | null
  observedAt: number
  permission: string
  displays: Array<{ id: string; label: string; primary: boolean; current: boolean; width: number; height: number; scaleFactor: number; rotation: number }>
}

declare global {
  interface Window {
    atlasBridge?: AtlasBridge
  }
}
