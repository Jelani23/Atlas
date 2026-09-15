"use client"

import { ActivityPanel } from "./activity-panel"
import { AliceCloud } from "./alice-cloud"
import { ChatInput } from "./chat-input"
import { HomeResponse } from "./home-response"
import { RecentConversation } from "./recent-conversation"
import { type AtlasState } from "./atlas-state"
import type { Message } from "@/lib/types"

interface HomeViewProps {
  state: AtlasState
  hostAvailable: boolean
  steps: string[]
  messages: Message[]
  typing: boolean
  listening: boolean
  onSend: (text: string) => void
  onToggleMic: () => void
  onOpenConversations: () => void
}

export function HomeView({
  state,
  hostAvailable,
  steps,
  messages,
  typing,
  listening,
  onSend,
  onToggleMic,
  onOpenConversations,
}: HomeViewProps) {
  const visualState: AtlasState = hostAvailable ? state : "dormant"

  return (
    <div className="animate-alice-page-in relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-3 px-6 pt-2 md:px-10 md:pt-5">
        <ActivityPanel steps={hostAvailable ? steps : []} state={visualState} />
        <div className="pointer-events-auto">
          <RecentConversation messages={messages} onOpen={onOpenConversations} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] overflow-hidden">
        <div className="grid min-h-0 grid-rows-[1fr_auto_1fr] overflow-hidden px-4">
          <div aria-hidden="true" />

          <div className="mx-auto w-full max-w-4xl">
            <div className="mx-auto h-[26vh] max-h-[300px] min-h-[160px] w-full">
              <AliceCloud state={visualState} />
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden">
            {hostAvailable ? (
              <HomeResponse
                messages={messages}
                typing={typing}
                onContinueInConversations={onOpenConversations}
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-start px-6 pt-4 text-center">
                <p className="font-display text-[22px] leading-none text-foreground/72">Alice is offline</p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-foreground/45">
                  She'll wake back up when the ATLAS host returns. Your saved chats and workspace are still here.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="relative z-30 mx-auto w-full max-w-2xl px-4 pb-6 md:pb-8">
          <ChatInput
            onSend={onSend}
            listening={listening}
            onToggleMic={onToggleMic}
            disabled={!hostAvailable}
            disabledPlaceholder="Alice is offline for now"
          />
        </div>
      </div>
    </div>
  )
}
