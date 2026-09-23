"use client"

import { useEffect, useState } from "react"
import { MessageSquarePlus, MessagesSquare, Pencil, RotateCcw, Trash2 } from "lucide-react"
import { ConversationThread } from "./conversation-thread"
import { ChatInput } from "./chat-input"
import { STATE_LABEL, type AtlasState } from "./atlas-state"
import { previewLine } from "@/lib/response-preview"
import type { ConversationSummary, Message } from "@/lib/types"

interface ConversationsViewProps {
  state: AtlasState
  hostAvailable: boolean
  messages: Message[]
  typing: boolean
  listening: boolean
  focusMessageId: string | null
  sessionId: string | null
  onSend: (text: string) => void
  onToggleMic: () => void
  onNewConversation: () => void
  onResumeConversation: (sessionId: string) => Promise<void>
  onConversationDeleted: (newSessionId: string | null) => void
}

interface ContextMenuState {
  id: string
  x: number
  y: number
}

function formatSessionLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const now = new Date()
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function ConversationsView({
  state,
  hostAvailable,
  messages,
  typing,
  listening,
  focusMessageId,
  sessionId,
  onSend,
  onToggleMic,
  onNewConversation,
  onResumeConversation,
  onConversationDeleted,
}: ConversationsViewProps) {
  const active = state === "thinking" || state === "working"
  const resumeBlocked = !hostAvailable || (state !== "idle" && state !== "error")

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [viewingMessages, setViewingMessages] = useState<Message[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [resuming, setResuming] = useState(false)

  useEffect(() => {
    const bridge = window.atlasBridge
    if (!bridge) {
      setListLoading(false)
      return
    }
    let cancelled = false
    setListLoading(true)
    bridge
      .listConversations()
      .then((list) => {
        if (!cancelled) setConversations(list)
      })
      .catch(() => {
        if (!cancelled) setConversations([])
      })
      .finally(() => {
        if (!cancelled) setListLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const openConversation = async (id: string) => {
    if (id === sessionId) {
      setViewingId(null)
      return
    }
    const bridge = window.atlasBridge
    if (!bridge) return
    setViewingId(id)
    setThreadLoading(true)
    try {
      const history = await bridge.getConversation(id)
      setViewingMessages(
        history.map((message, index) => ({
          id: `${id}-${index}`,
          role: message.role === "assistant" ? "atlas" : "user",
          text: message.content,
        })),
      )
    } catch {
      setViewingMessages([])
    } finally {
      setThreadLoading(false)
    }
  }

  const returnToCurrent = () => setViewingId(null)

  const resumeConversation = async () => {
    if (!hostAvailable || !viewingId || resuming) return
    setResuming(true)
    try {
      await onResumeConversation(viewingId)
      setViewingId(null)
      setViewingMessages([])
    } finally {
      setResuming(false)
    }
  }

  useEffect(() => {
    if (!contextMenu) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [contextMenu])

  const startRename = (conversation: ConversationSummary) => {
    setRenameValue(conversation.title ?? (conversation.preview ? previewLine(conversation.preview, 56) : ""))
    setRenamingId(conversation.id)
    setContextMenu(null)
  }

  const commitRename = async (id: string) => {
    const value = renameValue.trim()
    setRenamingId(null)
    const bridge = window.atlasBridge
    if (!bridge || !value) return
    try {
      const result = await bridge.renameConversation(id, value)
      setConversations((prev) => prev.map((conversation) =>
        conversation.id === id ? { ...conversation, title: result.title ?? value } : conversation,
      ))
    } catch {
      // Cloud list will resync on the next fetch.
    }
  }

  const deleteConversation = async (id: string) => {
    setContextMenu(null)
    const bridge = window.atlasBridge
    if (!bridge) return
    setConversations((prev) => prev.filter((conversation) => conversation.id !== id))
    if (viewingId === id) setViewingId(null)
    try {
      const result = await bridge.deleteConversation(id)
      if (result.newSessionId) onConversationDeleted(result.newSessionId)
    } catch {
      // Cloud list will resync on the next fetch.
    }
  }

  const isViewingPast = viewingId !== null
  const shownMessages = isViewingPast ? viewingMessages : messages
  const viewingConversation = conversations.find((conversation) => conversation.id === viewingId)

  return (
    <div className="relative flex min-h-0 flex-1 gap-2 overflow-hidden px-2 pb-3 pt-1 md:gap-3 md:px-3 md:pb-4">
      <aside className="conversation-history-cloud relative -ml-4 flex w-[18.5rem] shrink-0 flex-col pl-5 pr-7 pt-5 md:w-[20rem] md:pl-7 md:pr-8">
        <div className="flex items-center justify-between pb-2">
          <div>
            <p className="text-[8px] font-medium uppercase tracking-[0.16em] text-primary/55">Conversation memory</p>
            <h2 className="font-display text-[17px] leading-none text-foreground/76">History</h2>
          </div>
          <button
            type="button"
            disabled={!hostAvailable}
            onClick={() => {
              if (!hostAvailable) return
              setViewingId(null)
              onNewConversation()
            }}
            className="alice-icon-button flex h-8 w-8 items-center justify-center bg-white/22 text-sky-deep/58 transition enabled:cursor-pointer enabled:hover:bg-white/44 enabled:hover:text-sky-deep disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={hostAvailable ? "Start a new conversation" : "Alice is offline"}
            title={hostAvailable ? "New conversation" : "Alice is offline"}
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="conversation-history-scroll min-h-0 flex-1 overflow-y-auto pb-8 pr-1">
          {listLoading && <p className="px-1 py-3 text-xs text-muted-foreground/60">Loading…</p>}
          {!listLoading && conversations.length === 0 && (
            <p className="px-1 py-3 text-xs leading-relaxed text-muted-foreground/60">
              Nothing logged yet. Conversations show up here as you talk to Alice.
            </p>
          )}

          {conversations.map((conversation) => {
            const isCurrent = conversation.id === sessionId
            const isSelected = isViewingPast ? conversation.id === viewingId : isCurrent
            const isRenaming = renamingId === conversation.id
            const label = conversation.title || (conversation.preview ? previewLine(conversation.preview, 56) : "Empty conversation")

            return (
              <div
                key={conversation.id}
                role="button"
                tabIndex={0}
                onClick={() => !isRenaming && openConversation(conversation.id)}
                onKeyDown={(event) => {
                  if (!isRenaming && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault()
                    void openConversation(conversation.id)
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setContextMenu({ id: conversation.id, x: event.clientX, y: event.clientY })
                }}
                className={`mb-1.5 flex w-full cursor-pointer flex-col gap-0.5 rounded-[1.2rem_1.55rem_1.25rem_1.65rem] px-3 py-2.5 text-left transition-all ${
                  isSelected
                    ? "bg-white/44 shadow-[0_7px_18px_-16px_rgba(49,103,154,0.6)]"
                    : "hover:bg-white/24"
                }`}
              >
                <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-primary/70">
                  <MessagesSquare className="h-3 w-3" aria-hidden="true" />
                  {isCurrent ? "Current" : formatSessionLabel(conversation.startedAt)}
                </span>
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === "Enter") {
                        event.preventDefault()
                        void commitRename(conversation.id)
                      } else if (event.key === "Escape") {
                        event.preventDefault()
                        setRenamingId(null)
                      }
                    }}
                    onBlur={() => void commitRename(conversation.id)}
                    className="w-full rounded-md border border-primary/30 bg-white/50 px-1.5 py-0.5 text-xs text-foreground outline-none"
                  />
                ) : (
                  <span className="truncate text-xs leading-relaxed text-foreground/76">{label}</span>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 min-w-[140px] overflow-hidden rounded-xl border border-border/60 bg-card/95 py-1 shadow-[0_12px_40px_-16px_rgba(80,130,190,0.45)] backdrop-blur-xl"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              type="button"
              onClick={() => {
                const conversation = conversations.find((item) => item.id === contextMenu.id)
                if (conversation) startRename(conversation)
              }}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-foreground/80 transition-colors hover:bg-secondary/70"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Rename
            </button>
            <button
              type="button"
              onClick={() => void deleteConversation(contextMenu.id)}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete
            </button>
          </div>
        </>
      )}

      <section className="conversation-workspace-cloud relative -mr-2 flex min-h-0 min-w-0 flex-1 flex-col px-6 pb-5 pt-5 md:-mr-3 md:px-8 md:pb-6 md:pt-6">
        <div className="relative z-20 flex min-h-[1.9rem] shrink-0 items-start justify-between gap-2 px-2">
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-primary/55">
              {isViewingPast ? "Conversation archive" : "Current conversation"}
            </p>
            <h1 className="truncate font-display text-[15px] leading-[1.05] text-foreground/78">
              {isViewingPast ? viewingConversation?.title || "Past conversation" : "Conversations"}
            </h1>
            {isViewingPast && viewingId && (
              <span className="mt-0.5 block text-[8px] font-medium text-muted-foreground/48">Session {viewingId}</span>
            )}
          </div>

          {isViewingPast ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={returnToCurrent}
                className="alice-nav-item cursor-pointer bg-white/28 px-2.5 py-1 text-[11px] text-foreground/58 transition hover:bg-white/48 hover:text-foreground/78"
              >
                ← Back to current
              </button>
              <button
                type="button"
                onClick={() => void resumeConversation()}
                disabled={resuming || resumeBlocked}
                className="alice-nav-item flex items-center gap-1.5 bg-white/42 px-2.5 py-1 text-[11px] text-sky-deep/72 transition enabled:cursor-pointer enabled:hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {resuming ? "Opening…" : hostAvailable ? "Resume conversation" : "Alice offline"}
              </button>
            </div>
          ) : (
            <span className={`mt-1 shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] text-primary/65 ${active ? "animate-pulse" : ""}`}>
              {STATE_LABEL[state]}
            </span>
          )}
        </div>

        <div className="conversation-thread-viewport relative z-0 -mt-3 -mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem_2.45rem_2.05rem_2.3rem]">
          <ConversationThread
            messages={shownMessages}
            typing={isViewingPast ? false : typing}
            focusMessageId={isViewingPast ? null : focusMessageId}
          />
          {threadLoading && (
            <div className="flex items-center justify-center gap-1.5 pb-4">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60" />
            </div>
          )}
        </div>

        <div className="relative z-20 mt-0 shrink-0 border-t border-sky-deep/10 px-3 pt-1">
          {isViewingPast ? (
            <div className="flex min-h-[2.9rem] items-center justify-between gap-2 rounded-[1.4rem_1.75rem_1.5rem_1.85rem] border border-white/30 bg-white/16 px-3">
              <div>
                <p className="font-display text-[11px] text-foreground/60">Viewing a saved conversation</p>
                <p className="mt-0 text-[8px] text-foreground/38">Resume it to continue talking from this session.</p>
              </div>
              <button
                type="button"
                onClick={() => void resumeConversation()}
                disabled={resuming || resumeBlocked}
                className="alice-nav-item flex shrink-0 items-center gap-1.5 bg-white/42 px-2.5 py-1.5 text-[11px] text-sky-deep/72 transition enabled:cursor-pointer enabled:hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {resuming ? "Opening…" : "Resume"}
              </button>
            </div>
          ) : (
            <ChatInput
              embedded
              onSend={onSend}
              listening={listening}
              onToggleMic={onToggleMic}
              disabled={!hostAvailable}
            />
          )}
        </div>
      </section>
    </div>
  )
}
