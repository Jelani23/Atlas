"use client"

import { useEffect, useState } from "react"
import { MessageSquarePlus, MessagesSquare, Pencil, Trash2 } from "lucide-react"
import { ConversationThread } from "./conversation-thread"
import { ChatInput } from "./chat-input"
import { STATE_LABEL, type AtlasState } from "./atlas-state"
import { previewLine } from "@/lib/response-preview"
import type { ConversationSummary, Message } from "@/lib/types"

interface ConversationsViewProps {
  state: AtlasState
  messages: Message[]
  typing: boolean
  listening: boolean
  focusMessageId: string | null
  /** id of the live/current session, so the sidebar can mark it and hydrate its own preview */
  sessionId: string | null
  onSend: (text: string) => void
  onToggleMic: () => void
  onNewConversation: () => void
  /** Called after a right-click "Delete" removes the currently-live session, with its replacement id. */
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
  const sameDay = date.toDateString() === now.toDateString()
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function ConversationsView({
  state,
  messages,
  typing,
  listening,
  focusMessageId,
  sessionId,
  onSend,
  onToggleMic,
  onNewConversation,
  onConversationDeleted,
}: ConversationsViewProps) {
  const active = state === "thinking" || state === "working"

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [viewingMessages, setViewingMessages] = useState<Message[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  // Refetches whenever the live session changes (e.g. after "New") so the
  // list stays in sync with what's actually in Supabase.
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
        history.map((m, i) => ({
          id: `${id}-${i}`,
          role: m.role === "assistant" ? "atlas" : "user",
          text: m.content,
        })),
      )
    } catch {
      setViewingMessages([])
    } finally {
      setThreadLoading(false)
    }
  }

  const returnToCurrent = () => setViewingId(null)

  // Close the right-click menu on Escape or a click anywhere outside it.
  useEffect(() => {
    if (!contextMenu) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null)
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
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: result.title ?? value } : c)),
      )
    } catch {
      // Rename failed silently — the list will resync next time it's fetched.
    }
  }

  const deleteConversation = async (id: string) => {
    setContextMenu(null)
    const bridge = window.atlasBridge
    if (!bridge) return
    // Optimistic — the sidebar shouldn't wait on a round trip to feel deleted.
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (viewingId === id) setViewingId(null)
    try {
      const result = await bridge.deleteConversation(id)
      if (result.newSessionId) onConversationDeleted(result.newSessionId)
    } catch {
      // Deletion failed — the list will resync (and the item reappear) next fetch.
    }
  }

  const isViewingPast = viewingId !== null
  const shownMessages = isViewingPast ? viewingMessages : messages

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      {/* history sidebar — its own scrollable column, entirely independent
          of the thread panel's width or content */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border/60 bg-card/30 md:w-72">
        <div className="flex items-center justify-between px-4 pb-2 pt-3 md:pt-4">
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            History
          </h2>
          <button
            type="button"
            onClick={() => {
              setViewingId(null)
              onNewConversation()
            }}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Start a new conversation"
            title="New conversation"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto themed-scroll px-2 pb-3">
          {listLoading && (
            <p className="px-2.5 py-3 text-xs text-muted-foreground/60">Loading…</p>
          )}

          {!listLoading && conversations.length === 0 && (
            <p className="px-2.5 py-3 text-xs leading-relaxed text-muted-foreground/60">
              Nothing logged yet. Conversations show up here as you talk to Alice.
            </p>
          )}

          {conversations.map((c) => {
            const isCurrent = c.id === sessionId
            const isSelected = isViewingPast ? c.id === viewingId : isCurrent
            const isRenaming = renamingId === c.id
            const label = c.title || (c.preview ? previewLine(c.preview, 56) : "Empty conversation")
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => !isRenaming && openConversation(c.id)}
                onKeyDown={(e) => {
                  if (!isRenaming && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault()
                    openConversation(c.id)
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ id: c.id, x: e.clientX, y: e.clientY })
                }}
                className={`mb-1 flex w-full cursor-pointer flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  isSelected ? "bg-primary/10" : "hover:bg-secondary/70"
                }`}
              >
                <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-primary/70">
                  <MessagesSquare className="h-3 w-3" aria-hidden="true" />
                  {isCurrent ? "Current" : formatSessionLabel(c.startedAt)}
                </span>
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === "Enter") {
                        e.preventDefault()
                        commitRename(c.id)
                      } else if (e.key === "Escape") {
                        e.preventDefault()
                        setRenamingId(null)
                      }
                    }}
                    onBlur={() => commitRename(c.id)}
                    className="w-full rounded-md border border-primary/40 bg-background/80 px-1.5 py-0.5 text-xs text-foreground outline-none"
                  />
                ) : (
                  <span className="truncate text-xs leading-relaxed text-foreground/80">{label}</span>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      {/* right-click menu — Rename / Delete, closes on Escape or an outside click */}
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
                const conversation = conversations.find((c) => c.id === contextMenu.id)
                if (conversation) startRename(conversation)
              }}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-foreground/80 transition-colors hover:bg-secondary/70"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Rename
            </button>
            <button
              type="button"
              onClick={() => deleteConversation(contextMenu.id)}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete
            </button>
          </div>
        </>
      )}

      {/* thread column — its own flex space, unaffected by the sidebar */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-2 md:px-8 md:pt-4">
          <h1 className="font-display text-base font-semibold text-foreground">
            {isViewingPast ? "Past conversation" : "Conversations"}
          </h1>
          {isViewingPast ? (
            <button
              type="button"
              onClick={returnToCurrent}
              className="cursor-pointer text-xs font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:text-primary/80"
            >
              ← Back to current
            </button>
          ) : (
            <span
              className={`text-[10px] font-medium uppercase tracking-[0.12em] text-primary/70 ${
                active ? "animate-pulse" : ""
              }`}
            >
              {STATE_LABEL[state]}
            </span>
          )}
        </div>

        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 pb-3 md:px-6">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/40 backdrop-blur-md shadow-[0_12px_40px_-18px_rgba(80,130,190,0.4)]">
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
        </div>

        {!isViewingPast && (
          <div className="relative z-30 mx-auto w-full max-w-3xl px-4 pb-6 md:px-6 md:pb-8">
            <ChatInput onSend={onSend} listening={listening} onToggleMic={onToggleMic} />
          </div>
        )}
      </div>
    </div>
  )
}
