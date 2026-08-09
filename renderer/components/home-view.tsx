"use client"

import { ActivityPanel } from "./activity-panel"
import { AtlasCloud } from "./atlas-cloud"
import { ChatInput } from "./chat-input"
import { HomeResponse } from "./home-response"
import { RecentConversation } from "./recent-conversation"
import { type AtlasState } from "./atlas-state"
import type { Message } from "@/lib/types"

interface HomeViewProps {
  state: AtlasState
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
  steps,
  messages,
  typing,
  listening,
  onSend,
  onToggleMic,
  onOpenConversations,
}: HomeViewProps) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* floating layer — thought path top-left, recent conversation top-right.
          `absolute` takes both fully out of the page's flow, onto their own
          stacking layer, so neither one's size can ever push/shrink anything
          else on the page. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-3 px-6 pt-2 md:px-10 md:pt-5">
        <ActivityPanel steps={steps} state={state} />
        <div className="pointer-events-auto">
          <RecentConversation messages={messages} onOpen={onOpenConversations} />
        </div>
      </div>

      {/* stage + chat bar, as two independent grid rows (1fr / auto) instead
          of a centered flex column. A grid row's size only ever depends on
          its own content, never on a sibling row's — so the chat bar growing
          as you type can never push the stage (cloud + response) upward. */}
      <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] overflow-hidden">
        {/* stage — cloud and response are themselves two more independent
            grid rows (auto / 1fr). The cloud's row is sized purely by its
            own fixed height classes, so a long response — which scrolls
            within its own row instead of growing it — can never nudge the
            cloud. Same "own container space" pattern as the floating layer
            above; reuse it for any future stage element. */}
        <div className="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden px-4">
          <div className="mx-auto w-full max-w-4xl pt-10 md:pt-16">
            <div className="mx-auto h-[30vh] max-h-[340px] min-h-[180px] w-full">
              <AtlasCloud state={state} />
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden">
            <HomeResponse
              messages={messages}
              typing={typing}
              onContinueInConversations={onOpenConversations}
            />
          </div>
        </div>

        {/* quick input — its own grid row, free to grow as you type without
            ever affecting the stage row above it */}
        <div className="relative z-30 mx-auto w-full max-w-2xl px-4 pb-6 md:pb-8">
          <ChatInput onSend={onSend} listening={listening} onToggleMic={onToggleMic} />
        </div>
      </div>
    </div>
  )
}
