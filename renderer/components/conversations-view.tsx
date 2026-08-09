"use client"

import { useEffect, useState } from "react"
import { MessageSquarePlus, MessagesSquare } from "lucide-react"
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
}: ConversationsViewProps) {
  const active = state === "thinking" || state === "working"

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [viewingMessages, setViewingMessages] = useState<Message[]>([])
  const [threadLoading, setThreadLoading] = useState(false)

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
              Nothing logged yet. Conversations show up here as you talk to Atlas.
            </p>
          )}

          {conversations.map((c) => {
            const isCurrent = c.id === sessionId
            const isSelected = isViewingPast ? c.id === viewingId : isCurrent
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => openConversation(c.id)}
                className={`mb-1 flex w-full cursor-pointer flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  isSelected ? "bg-primary/10" : "hover:bg-secondary/70"
                }`}
              >
                <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-primary/70">
                  <MessagesSquare className="h-3 w-3" aria-hidden="true" />
                  {isCurrent ? "Current" : formatSessionLabel(c.startedAt)}
                </span>
                <span className="truncate text-xs leading-relaxed text-foreground/80">
                  {c.preview ? previewLine(c.preview, 56) : "Empty conversation"}
                </span>
              </button>
            )
          })}
        </div>
      </aside>

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
