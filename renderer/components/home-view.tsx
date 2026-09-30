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
  const dormant = visualState === "dormant"

  return (
    <div className="animate-alice-page-in relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Home-only ambient layer. The global sky supplies the atmosphere; these
          smaller forms make Alice's immediate space feel inhabited. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className={`animate-drift-slow absolute left-[12%] top-[37%] transition-opacity duration-700 ${dormant ? "opacity-10" : "opacity-20"}`}>
          <span className="absolute h-8 w-12 rounded-full bg-white/42 blur-[2px]" />
          <span className="absolute -left-3 top-3 h-6 w-8 rounded-full bg-white/34 blur-[2px]" />
        </div>
        <div className={`animate-drift absolute right-[13%] top-[33%] transition-opacity duration-700 ${dormant ? "opacity-8" : "opacity-18"}`}>
          <span className="absolute h-7 w-11 rounded-full bg-white/40 blur-[2px]" />
          <span className="absolute left-7 top-3 h-5 w-7 rounded-full bg-white/30 blur-[2px]" />
        </div>
      </div>

      {/* Secondary information stays tucked at the edges until it is useful. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-3 px-5 pt-2 md:px-10 md:pt-5">
        <ActivityPanel steps={hostAvailable ? steps : []} state={visualState} />
        <div className="pointer-events-auto">
          <RecentConversation messages={messages} onOpen={onOpenConversations} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] overflow-hidden">
        <div className="grid min-h-0 grid-rows-[1fr_auto_1fr] overflow-hidden px-4">
          <div aria-hidden="true" />

          {/* Alice is the visual anchor. The soft ring and neighboring puffs are
              environmental, not panels or status indicators. */}
          <div className="relative mx-auto w-full max-w-4xl">
            <div
              aria-hidden="true"
              className={`absolute left-1/2 top-1/2 h-[72%] w-[54%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-white/18 bg-white/[0.035] blur-[0.3px] transition-opacity duration-700 ${
                dormant ? "opacity-25" : "opacity-70"
              }`}
            />
            <div
              aria-hidden="true"
              className={`animate-drift-slow absolute left-[17%] top-[42%] h-8 w-14 rounded-[52%_48%_58%_42%/48%_55%_45%_52%] bg-white/24 blur-[1px] transition-opacity duration-700 ${
                dormant ? "opacity-15" : "opacity-55"
              }`}
            />
            <div
              aria-hidden="true"
              className={`animate-drift absolute right-[18%] top-[49%] h-7 w-12 rounded-[46%_54%_44%_56%/56%_44%_52%_48%] bg-white/22 blur-[1px] transition-opacity duration-700 ${
                dormant ? "opacity-10" : "opacity-45"
              }`}
            />

            <div className="relative mx-auto h-[27vh] max-h-[310px] min-h-[165px] w-full">
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
              <div className="animate-rise flex min-h-0 flex-1 flex-col items-center justify-start px-6 pt-3 text-center">
                <p className="font-display text-[23px] leading-none text-foreground/70">Alice is offline</p>
                <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-foreground/40">
                  She'll wake back up when the ATLAS host returns. Your saved chats and workspace are still here.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="relative z-30 mx-auto w-full max-w-2xl px-4 pb-6 md:pb-8">
          <div className="animate-alice-page-in [animation-delay:90ms]">
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
    </div>
  )
}
