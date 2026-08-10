export interface Message {
  id: string
  role: "atlas" | "user"
  text: string
  /** True while this message is still receiving live atlas.streaming tokens. */
  streaming?: boolean
}

/** One entry in the conversation history list (Conversations tab sidebar). */
export interface ConversationSummary {
  id: string
  startedAt: string
  endedAt: string | null
  /** Manually-set name from the sidebar's right-click "Rename", if any. */
  title: string | null
  preview: string
  isCurrent: boolean
}

/** A single stored message as returned by the backend's session history. */
export interface StoredMessage {
  role: "user" | "assistant"
  content: string
  timestamp: string
}