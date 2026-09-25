// renderer/components/atlas-app.tsx
"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import { Settings } from "lucide-react"
import { BottomNav, type AtlasTab } from "./bottom-nav"
import { CloudProjectsView } from "./cloud-projects-view"
import { ComingSoon } from "./coming-soon"
import { ConversationsView } from "./conversations-view"
import { DevicesView } from "./devices-view"
import { HomeView } from "./home-view"
import { TasksView } from "./tasks-view"
import { TitleBarControls } from "./title-bar-controls"
import { type AtlasState } from "./atlas-state"
import type { AtlasEvent } from "@/lib/atlas-events"
import { attachAudioElement, setPlaying as setSpeechPlaying, setVisemeSource } from "@/lib/audio-level"
import { setAtlasActiveTab } from "@/lib/active-tab"
import { setEmotion, emotionState } from "@/lib/emotion"
import type { PhonemeTimestamp } from "@/lib/visemes"
import type { Message } from "@/lib/types"
import type { AtlasConnectionState } from "@/lib/web-atlas-bridge"

if (typeof window !== "undefined") {
  ;(window as unknown as { aliceEmotion?: typeof setEmotion }).aliceEmotion = setEmotion
  ;(window as unknown as { aliceEmotionState?: typeof emotionState }).aliceEmotionState = emotionState
}

const DRAG: CSSProperties = { WebkitAppRegion: "drag" } as CSSProperties
const NO_DRAG: CSSProperties = { WebkitAppRegion: "no-drag" } as CSSProperties

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

function hostStatusLabel(state: AtlasConnectionState) {
  if (state === "offline") return "Alice offline"
  if (state === "connecting") return "Finding Alice"
  if (state === "initializing") return "Waking Alice"
  return null
}

interface AtlasAppProps {
  hostConnectionState: AtlasConnectionState
}

export function AtlasApp({ hostConnectionState }: AtlasAppProps) {
  const hostAvailable = hostConnectionState === "online"
  const [state, setState] = useState<AtlasState>("idle")
  const [steps, setSteps] = useState<string[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [typing, setTyping] = useState(false)
  const [tab, setTab] = useState<AtlasTab>("home")
  const [listening, setListening] = useState(false)
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  useEffect(() => {
    setAtlasActiveTab(tab)
  }, [tab])

  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const audioIdleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const activeRequestIdRef = useRef<string | null>(null)
  const isGeneratingRef = useRef(false)

  useEffect(() => {
    const bridge = window.atlasBridge
    if (!bridge) return

    const unsubscribe = bridge.onEvent((event) => {
      console.log("[Frontend] Received event:", event.type, event.payload)

      if ((event.type as string) === "atlas.request_started") {
        activeRequestIdRef.current = typeof event.payload?.requestId === "string" ? event.payload.requestId : null
        isGeneratingRef.current = true
      } else if (event.type === "atlas.status" && event.payload?.phase === "reply_ready") {
        isGeneratingRef.current = false
      }

      const nextState = stateForEvent(event)
      if (nextState) setState(nextState)

      const step = describeEvent(event)
      if (step) setSteps((prev) => [...prev, step])

      if (event.type === "atlas.streaming") {
        const token = typeof event.payload?.token === "string" ? event.payload.token : ""
        const reqId = typeof event.payload?.requestId === "string" ? event.payload.requestId : null
        if (!token || reqId !== activeRequestIdRef.current) return

        setTyping(false)
        setState("speaking")
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.role === "atlas" && last.streaming) {
            return [...prev.slice(0, -1), { ...last, text: last.text + token }]
          }
          return [...prev, { id: crypto.randomUUID(), role: "atlas", text: token, streaming: true }]
        })
      }

      if ((event.type as string) === "atlas.audio_chunk") {
        const audioBase64 = typeof event.payload?.audio === "string" ? event.payload.audio : ""
        const reqId = typeof event.payload?.requestId === "string" ? event.payload.requestId : null
        const phonemes = Array.isArray(event.payload?.phonemes)
          ? (event.payload.phonemes as PhonemeTimestamp[])
          : undefined

        if (audioBase64 && reqId === activeRequestIdRef.current) {
          clearTimeout(settleTimer.current)
          queueAudio(audioBase64, phonemes)
        }
      } else if (event.type === "atlas.response") {
        const text = typeof event.payload?.text === "string" ? event.payload.text : ""
        setTyping(false)
        setState("speaking")
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "atlas", text }])
        settleTimer.current = setTimeout(() => setState("idle"), 3000)
      } else if (event.type === "atlas.error") {
        const message =
          typeof event.payload?.message === "string"
            ? event.payload.message
            : "Something went wrong talking to Alice."
        setTyping(false)
        setState("error")
        setEmotion("angry", 0.6)
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "atlas", text: message }])
      }
    })

    return unsubscribe
  }, [])

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
          history.map((message, index) => ({
            id: `restored-${current.sessionId}-${index}`,
            role: message.role === "assistant" ? "atlas" : "user",
            text: message.content,
          })),
        )
      } catch {
        // Cloud-backed pages remain usable while the host is unavailable.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => () => {
    clearTimeout(settleTimer.current)
    clearTimeout(audioIdleTimer.current)
  }, [])

  interface QueuedAudioChunk {
    audio: string
    phonemes?: PhonemeTimestamp[]
  }

  const audioQueueRef = useRef<QueuedAudioChunk[]>([])
  const isPlayingRef = useRef(false)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const AUDIO_IDLE_GRACE_MS = 600

  const playNextAudio = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false
      currentAudioRef.current = null
      setSpeechPlaying(false)
      setVisemeSource(null)

      if (!isGeneratingRef.current) {
        clearTimeout(audioIdleTimer.current)
        audioIdleTimer.current = setTimeout(() => {
          if (!isPlayingRef.current) setState("idle")
        }, AUDIO_IDLE_GRACE_MS)
      }
      return
    }

    clearTimeout(audioIdleTimer.current)
    setState("speaking")

    isPlayingRef.current = true
    const chunk = audioQueueRef.current.shift()!
    const audio = new Audio(chunk.audio)
    currentAudioRef.current = audio

    attachAudioElement(audio)
    setVisemeSource(audio, chunk.phonemes)
    setSpeechPlaying(true)

    audio.onended = () => {
      currentAudioRef.current = null
      setTimeout(() => playNextAudio(), 150)
    }
    audio.onerror = () => {
      console.error("Audio playback error, skipping to next chunk.")
      currentAudioRef.current = null
      playNextAudio()
    }
    audio.play().catch((error) => {
      console.error("Audio play failed:", error)
      currentAudioRef.current = null
      playNextAudio()
    })
  }, [])

  const queueAudio = useCallback((audioBase64: string, phonemes?: PhonemeTimestamp[]) => {
    audioQueueRef.current.push({ audio: audioBase64, phonemes })
    if (!isPlayingRef.current) playNextAudio()
  }, [playNextAudio])

  const stopAudioPlayback = useCallback(() => {
    audioQueueRef.current = []
    clearTimeout(audioIdleTimer.current)
    if (currentAudioRef.current) {
      currentAudioRef.current.onended = null
      currentAudioRef.current.onerror = null
      currentAudioRef.current.pause()
      currentAudioRef.current.src = ""
      currentAudioRef.current = null
    }
    isPlayingRef.current = false
    setSpeechPlaying(false)
    setVisemeSource(null)
  }, [])

  const runFlow = useCallback(async (userText: string) => {
    if (!hostAvailable) return

    clearTimeout(settleTimer.current)
    stopAudioPlayback()
    setListening(false)
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: userText }])
    setSteps([])
    setState("thinking")
    setTyping(true)

    const bridge = window.atlasBridge
    if (!bridge) {
      setTyping(false)
      setState("error")
      return
    }

    const result = await bridge.sendMessage(userText)
    setTyping(false)

    if (result.ok) {
      setState("speaking")
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.role === "atlas" && last.streaming) {
          return [...prev.slice(0, -1), { ...last, streaming: false, text: result.reply ?? last.text }]
        }
        return [...prev, { id: crypto.randomUUID(), role: "atlas", text: result.reply ?? "" }]
      })
      settleTimer.current = setTimeout(() => setState("idle"), 3000)
    } else {
      setState("error")
      setEmotion("angry", 0.6)
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "atlas", text: result.error ?? "Something went wrong talking to Alice." },
      ])
    }
  }, [hostAvailable, stopAudioPlayback])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const vadAudioContextRef = useRef<AudioContext | null>(null)
  const vadAnalyserRef = useRef<AnalyserNode | null>(null)
  const vadAnimationFrameRef = useRef<number | null>(null)
  const vadSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vadHasSpeechRef = useRef(false)
  const VAD_THRESHOLD = 0.02
  const VAD_SILENCE_DURATION = 1500

  const stopRecording = useCallback(() => {
    if (vadAnimationFrameRef.current) {
      cancelAnimationFrame(vadAnimationFrameRef.current)
      vadAnimationFrameRef.current = null
    }
    if (vadSilenceTimerRef.current) {
      clearTimeout(vadSilenceTimerRef.current)
      vadSilenceTimerRef.current = null
    }
    if (vadAudioContextRef.current) {
      void vadAudioContextRef.current.close()
      vadAudioContextRef.current = null
      vadAnalyserRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
    }
    setListening(false)
  }, [])

  const startRecording = useCallback(async () => {
    if (!hostAvailable) return

    try {
      stopAudioPlayback()
      clearTimeout(settleTimer.current)

      try {
        await (window.atlasBridge as any).interrupt()
        activeRequestIdRef.current = null
      } catch (error) {
        console.warn("Backend interrupt failed", error)
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        const reader = new FileReader()
        reader.readAsDataURL(audioBlob)
        reader.onloadend = async () => {
          const base64Audio = reader.result as string
          setTyping(true)
          setState("transcribing")
          setSteps((prev) => [...prev, "Transcribing audio…"])

          try {
            const result = await (window.atlasBridge as any).transcribeAudio(base64Audio)
            if (result.ok && result.text.trim()) {
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
          } catch {
            setTyping(false)
            setState("error")
            setEmotion("angry", 0.5)
          }
        }
      }

      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder
      setListening(true)
      setState("listening")

      vadHasSpeechRef.current = false
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 512
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      vadAudioContextRef.current = audioContext
      vadAnalyserRef.current = analyser
      const buffer = new Uint8Array(analyser.frequencyBinCount)

      const checkAudio = () => {
        if (!vadAnalyserRef.current || !mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") return

        vadAnalyserRef.current.getByteTimeDomainData(buffer)
        let sum = 0
        for (let i = 0; i < buffer.length; i++) {
          const value = (buffer[i] - 128) / 128
          sum += value * value
        }
        const volume = Math.sqrt(sum / buffer.length)

        if (volume > VAD_THRESHOLD) {
          vadHasSpeechRef.current = true
          if (vadSilenceTimerRef.current) {
            clearTimeout(vadSilenceTimerRef.current)
            vadSilenceTimerRef.current = null
          }
        } else if (vadHasSpeechRef.current && !vadSilenceTimerRef.current) {
          vadSilenceTimerRef.current = setTimeout(() => stopRecording(), VAD_SILENCE_DURATION)
        }

        vadAnimationFrameRef.current = requestAnimationFrame(checkAudio)
      }

      checkAudio()
    } catch (error) {
      console.error("Microphone access denied or failed:", error)
      setState("error")
      setEmotion("angry", 0.5)
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "atlas", text: "I need microphone permissions to listen." },
      ])
    }
  }, [hostAvailable, runFlow, stopAudioPlayback, stopRecording])

  const handleMic = useCallback(() => {
    if (!hostAvailable) return
    if (listening) stopRecording()
    else void startRecording()
  }, [hostAvailable, listening, startRecording, stopRecording])

  const openConversations = useCallback(() => {
    const latest = messages[messages.length - 1]
    setFocusMessageId(latest && latest.role === "atlas" ? latest.id : null)
    setTab("conversations")
  }, [messages])

  const handleTabChange = (id: AtlasTab) => {
    if (id !== "conversations") setFocusMessageId(null)
    setTab(id)
  }

  const resetLiveSession = useCallback((newSessionId: string, history: Message[] = []) => {
    clearTimeout(settleTimer.current)
    stopAudioPlayback()
    setSessionId(newSessionId)
    setMessages(history)
    setSteps([])
    setState("idle")
    setFocusMessageId(null)
  }, [stopAudioPlayback])

  const handleNewConversation = useCallback(async () => {
    if (!hostAvailable) return
    const bridge = window.atlasBridge
    if (!bridge) return
    const result = await bridge.newConversation()
    resetLiveSession(result.sessionId)
  }, [hostAvailable, resetLiveSession])

  const handleResumeConversation = useCallback(async (targetSessionId: string) => {
    if (!hostAvailable) return
    const bridge = window.atlasBridge
    if (!bridge) return
    clearTimeout(settleTimer.current)
    stopAudioPlayback()
    const result = await bridge.resumeConversation(targetSessionId)
    const history = await bridge.getConversation(result.sessionId)
    resetLiveSession(
      result.sessionId,
      history.map((message, index) => ({
        id: `resumed-${result.sessionId}-${index}`,
        role: message.role === "assistant" ? "atlas" : "user",
        text: message.content,
      })),
    )
  }, [hostAvailable, resetLiveSession, stopAudioPlayback])

  const handleConversationDeleted = useCallback((newSessionId: string | null) => {
    if (newSessionId) resetLiveSession(newSessionId)
  }, [resetLiveSession])

  const hostLabel = hostStatusLabel(hostConnectionState)

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden">
      <header className="relative z-10 flex items-center gap-3 px-4 py-3 md:px-8" style={DRAG}>
        <div className="flex shrink-0 items-center gap-2.5 pl-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            A
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-foreground">Atlas</span>
          {hostLabel && <span className="ml-1 text-[11px] font-medium text-muted-foreground/65">{hostLabel}</span>}
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
          hostAvailable={hostAvailable}
          steps={steps}
          messages={messages}
          typing={typing}
          listening={listening}
          onSend={runFlow}
          onToggleMic={handleMic}
          onOpenConversations={openConversations}
        />
      )}

      {tab === "conversations" && (
        <ConversationsView
          state={hostAvailable ? state : "dormant"}
          hostAvailable={hostAvailable}
          messages={messages}
          typing={typing}
          listening={listening}
          focusMessageId={focusMessageId}
          sessionId={sessionId}
          onSend={runFlow}
          onToggleMic={handleMic}
          onNewConversation={handleNewConversation}
          onResumeConversation={handleResumeConversation}
          onConversationDeleted={handleConversationDeleted}
        />
      )}

      {tab === "projects" && <CloudProjectsView />}
      {tab === "tasks" && <TasksView />}
      {tab === "devices" && <DevicesView />}
      {tab === "settings" && <ComingSoon icon={Settings} label="Settings" />}
    </main>
  )
}
