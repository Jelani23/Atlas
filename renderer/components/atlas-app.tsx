"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import { Activity, FolderOpen, Settings, Sparkles } from "lucide-react"
import { BottomNav } from "./bottom-nav"
import { ComingSoon } from "./coming-soon"
import { ConversationsView } from "./conversations-view"
import { HomeView } from "./home-view"
import { TitleBarControls } from "./title-bar-controls"
import { type AtlasState } from "./atlas-state"
import type { AtlasEvent } from "@/lib/atlas-events"
import type { Message } from "@/lib/types"

// The window is created with frame: false (electron/main.js), so this whole
// header doubles as the OS drag region. Anything interactive inside it (the
// nav, the window controls) opts back out with NO_DRAG, or clicks won't land.
const DRAG: CSSProperties = { WebkitAppRegion: "drag" } as CSSProperties
const NO_DRAG: CSSProperties = { WebkitAppRegion: "no-drag" } as CSSProperties

// How long the cloud lingers in "speaking" before settling back to idle.
// Purely cosmetic — there's no "finished speaking" event yet (that'll come
// with TTS), so this just gives the reply a moment to be read.
const SPEAKING_SETTLE_MS = 4500

/**
 * Turns a raw atlas.* event into a human-readable line for the thought-path
 * panel. Returns null for events that shouldn't add a visible step.
 */
function describeEvent(event: AtlasEvent): string | null {
  const phase = typeof event.payload?.phase === "string" ? event.payload.phase : undefined

  switch (event.type) {
    case "atlas.thinking":
      if (phase === "generating") return "Composing a response…"
      return "Understanding request…"
    case "atlas.tool_started":
      return "Deciding on an approach…"
    case "atlas.tool_completed": {
      const tool = typeof event.payload?.tool === "string" ? event.payload.tool : null
      return tool ? `Used ${tool.replace(/_/g, " ")}` : "No tool needed"
    }
    case "atlas.status":
      if (phase === "memory") return "Updating memory…"
      if (phase === "context") return "Gathering context…"
      return null
    case "atlas.model_changed": {
      const model = typeof event.payload?.model === "string" ? event.payload.model : "a different model"
      return `Switched to ${model}`
    }
    case "atlas.error":
      return "Ran into a problem…"
    default:
      return null
  }
}

/** Maps an atlas.* event to a cloud/activity state, or null to leave it alone. */
function stateForEvent(event: AtlasEvent): AtlasState | null {
  switch (event.type) {
    case "atlas.thinking":
      return "thinking"
    case "atlas.tool_started":
    case "atlas.tool_completed":
      return "working"
    case "atlas.error":
      return "error"
    default:
      return null
  }
}

const PLACEHOLDER_TABS: Record<string, { icon: typeof Sparkles; label: string }> = {
  memory: { icon: Sparkles, label: "Memory" },
  projects: { icon: FolderOpen, label: "Projects" },
  activity: { icon: Activity, label: "Activity" },
  settings: { icon: Settings, label: "Settings" },
}

export function AtlasApp() {
  const [state, setState] = useState<AtlasState>("idle")
  const [steps, setSteps] = useState<string[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [typing, setTyping] = useState(false)
  const [tab, setTab] = useState("home")
  const [listening, setListening] = useState(false)
  const [connected, setConnected] = useState(true)
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const bridge = window.atlasBridge
    if (!bridge) {
      setConnected(false)
      return
    }

    const unsubscribe = bridge.onEvent((event) => {
      console.log("[Frontend] Received event:", event.type, event.payload);
      const nextState = stateForEvent(event)
      if (nextState) setState(nextState)

      const step = describeEvent(event)
      if (step) setSteps((prev) => [...prev, step])

      // Live LLM tokens as the backend generates them — appended onto a
      // single in-progress message (streaming: true) so the reply grows in
      // place instead of flashing a new bubble per token. The id is set
      // once here and never changes again for this message — runFlow()
      // below only flips `streaming` to false and fills in the final text,
      // so the id (and therefore the message's React key) stays stable for
      // its whole life and the rise-in animation never replays mid-stream
      // or right as streaming finishes.
      if (event.type === "atlas.streaming") {
        const token = typeof event.payload?.token === "string" ? event.payload.token : ""
        if (!token) return

        setTyping(false)
        setState("speaking")
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.role === "atlas" && last.streaming) {
            return [...prev.slice(0, -1), { ...last, text: last.text + token }]
          }
          return [
            ...prev,
            { id: crypto.randomUUID(), role: "atlas", text: token, streaming: true },
          ]
        })
      }
      // 10E: Listen for streaming TTS audio chunks
      if ((event.type as string) === "atlas.audio_chunk") {
        const audioBase64 = typeof event.payload?.audio === "string" ? event.payload.audio : ""
        if (audioBase64) {
          queueAudio(audioBase64)
        }
      }
      // Delayed replies from background tasks...
      else if (event.type === "atlas.response") {
        const text = typeof event.payload?.text === "string" ? event.payload.text : ""
        setTyping(false)
        setState("speaking")
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "atlas", text }])
        settleTimer.current = setTimeout(() => setState("idle"), SPEAKING_SETTLE_MS)
      } else if (event.type === "atlas.error") {
        const message =
          typeof event.payload?.message === "string"
            ? event.payload.message
            : "Something went wrong talking to Atlas."
        setTyping(false)
        setState("error")
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "atlas", text: message }])
      }
    })

    return unsubscribe
  }, [])

  // Restore whatever's already in the current session from Supabase, so a
  // renderer reload (Cmd/Ctrl+R) doesn't wipe the conversation — it's only
  // ever cleared by explicitly starting a new one.
  useEffect(() => {
    const bridge = window.atlasBridge
    if (!bridge) return

    let cancelled = false
    ;(async () => {
      try {
        const current = await bridge.getState()
        if (cancelled || !current.sessionId) return
        setSessionId(current.sessionId)

        const history = await bridge.getConversation(current.sessionId)
        if (cancelled || history.length === 0) return

        setMessages(
          history.map((m, i) => ({
            id: `restored-${current.sessionId}-${i}`,
            role: m.role === "assistant" ? "atlas" : "user",
            text: m.content,
          })),
        )
      } catch {
        // Backend not reachable yet or history unavailable — just start fresh.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => () => clearTimeout(settleTimer.current), [])

  // 10G: Audio Queue & Playback Manager
  const audioQueueRef = useRef<string[]>([])
  const isPlayingRef = useRef(false)

  const playNextAudio = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false
      return
    }

    isPlayingRef.current = true
    const audioBase64 = audioQueueRef.current.shift()
    
    const audio = new Audio(audioBase64)
    audio.onended = () => {
      // When this chunk finishes, play the next one
      playNextAudio()
    }
    audio.onerror = () => {
      console.error("Audio playback error, skipping to next chunk.")
      playNextAudio()
    }
    audio.play().catch(err => {
      console.error("Audio play failed:", err)
      playNextAudio()
    })
  }, [])

  const queueAudio = useCallback((audioBase64: string) => {
    audioQueueRef.current.push(audioBase64)
    if (!isPlayingRef.current) {
      playNextAudio()
    }
  }, [playNextAudio])

  const runFlow = useCallback(async (userText: string) => {
    clearTimeout(settleTimer.current)
    
    audioQueueRef.current = []
    isPlayingRef.current = false
    
    setListening(false)
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: userText }])
    setSteps([])
    setState("thinking")
    setTyping(true)

    const bridge = window.atlasBridge
    if (!bridge) {
      setTyping(false)
      setState("error")
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "atlas",
          text: "I'm not connected to the Atlas backend right now — this only works inside the Electron app.",
        },
      ])
      return
    }

    // Atlas always keeps (and returns) the complete response. Any preview /
    // truncation happens purely in the Home view's presentation layer — the
    // full text below is exactly what's stored and shown in Conversations.
    // Atlas always keeps (and returns) the complete response. 
    const result = await bridge.sendMessage(userText)
    setTyping(false)

    if (result.ok) {
      setState("speaking")
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.role === "atlas" && last.streaming) {
          return [
            ...prev.slice(0, -1),
            { ...last, streaming: false, text: result.reply ?? last.text },
          ]
        }
        return [
          ...prev,
          { id: crypto.randomUUID(), role: "atlas", text: result.reply ?? "" },
        ]
      })

      settleTimer.current = setTimeout(() => setState("idle"), SPEAKING_SETTLE_MS)
    } else {
      setState("error")
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "atlas",
          text: result.error ?? "Something went wrong talking to Atlas.",
        },
      ])
    }
  }, [])

  useEffect(() => () => clearTimeout(settleTimer.current), [])

  // 9E: Microphone capture refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        
        // Convert to Base64 to send over WebSocket
        const reader = new FileReader()
        reader.readAsDataURL(audioBlob)
        reader.onloadend = async () => {
          const base64Audio = reader.result as string
          
          // Update UI to show we are processing the voice
          setTyping(true)
          setState("thinking")
          setSteps((prev) => [...prev, "Transcribing audio…"])
          
          try {
            const result = await (window.atlasBridge as any).transcribeAudio(base64Audio)
            if (result.ok && result.text.trim()) {
              // 9G: Feed transcript directly into existing conversation pipeline
              runFlow(result.text)
            } else {
              setTyping(false)
              setState("idle")
              setSteps([])
              setMessages((prev) => [
                ...prev,
                { id: crypto.randomUUID(), role: "atlas", text: "I couldn't catch that. Could you try again?" },
              ])
            }
          } catch (err) {
            setTyping(false)
            setState("error")
          }
        }
      }

      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder
      setListening(true)
      setState("listening")
    } catch (err) {
      console.error("Microphone access denied or failed:", err)
      setState("error")
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "atlas", text: "I need microphone permissions to listen." },
      ])
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
      // Stop all audio tracks to turn off the mic hardware
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
    }
    setListening(false)
  }

  const handleMic = () => {
    if (listening) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const openConversations = useCallback(() => {
    const latest = messages[messages.length - 1]
    setFocusMessageId(latest && latest.role === "atlas" ? latest.id : null)
    setTab("conversation")
  }, [messages])

  const handleTabChange = (id: string) => {
    if (id !== "conversation") setFocusMessageId(null)
    setTab(id)
  }

  // Shared by "New conversation" and "deleted the conversation I'm
  // currently in" — both land on a fresh, empty live session the same way.
  const resetLiveSession = useCallback((newSessionId: string) => {
    clearTimeout(settleTimer.current)
    setSessionId(newSessionId)
    setMessages([])
    setSteps([])
    setState("idle")
    setFocusMessageId(null)
  }, [])

  const handleNewConversation = useCallback(async () => {
    const bridge = window.atlasBridge
    if (!bridge) return
    const result = await bridge.newConversation()
    resetLiveSession(result.sessionId)
  }, [resetLiveSession])

  // Called by ConversationsView after a right-click "Delete" — only acts
  // when the deleted conversation was the live one (backend hands back the
  // replacement session it already started).
  const handleConversationDeleted = useCallback(
    (newSessionId: string | null) => {
      if (newSessionId) resetLiveSession(newSessionId)
    },
    [resetLiveSession],
  )

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden">
      {/* atmospheric sky handled by parent */}

      {/* top bar — also the custom title bar (the OS one is turned off).
          Identity, nav, date, and window controls all inline in one
          fixed-height, draggable row. */}
      <header className="relative z-10 flex items-center gap-3 px-4 py-3 md:px-8" style={DRAG}>
        <div className="flex shrink-0 items-center gap-2.5 pl-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            A
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-foreground">
            Atlas
          </span>
          {!connected && (
            <span className="ml-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
              Offline
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 justify-center" style={NO_DRAG}>
          <BottomNav active={tab} onChange={handleTabChange} />
        </div>

        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </span>

        <TitleBarControls />
      </header>

      {tab === "home" && (
        <HomeView
          state={state}
          steps={steps}
          messages={messages}
          typing={typing}
          listening={listening}
          onSend={runFlow}
          onToggleMic={handleMic}
          onOpenConversations={openConversations}
        />
      )}

      {tab === "conversation" && (
        <ConversationsView
          state={state}
          messages={messages}
          typing={typing}
          listening={listening}
          focusMessageId={focusMessageId}
          sessionId={sessionId}
          onSend={runFlow}
          onToggleMic={handleMic}
          onNewConversation={handleNewConversation}
          onConversationDeleted={handleConversationDeleted}
        />
      )}

      {PLACEHOLDER_TABS[tab] && (
        <ComingSoon icon={PLACEHOLDER_TABS[tab].icon} label={PLACEHOLDER_TABS[tab].label} />
      )}
    </main>
  )
}