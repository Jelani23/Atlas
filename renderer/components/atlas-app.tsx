// renderer/components/atlas-app.tsx
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
import { attachAudioElement, setPlaying as setSpeechPlaying, setVisemeSource } from "@/lib/audio-level"
import { setEmotion } from "@/lib/emotion"
import { emotionState } from "@/lib/emotion"
import type { PhonemeTimestamp } from "@/lib/visemes"

if (typeof window !== "undefined") {
  ;(window as unknown as { aliceEmotion?: typeof setEmotion }).aliceEmotion = setEmotion
  ;(window as unknown as { aliceEmotionState?: typeof emotionState }).aliceEmotionState = emotionState
}
import type { Message } from "@/lib/types"

const DRAG: CSSProperties = { WebkitAppRegion: "drag" } as CSSProperties
const NO_DRAG: CSSProperties = { WebkitAppRegion: "no-drag" } as CSSProperties

// Removed SPEAKING_SETTLE_MS - The audio queue is now the source of truth

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
  
  // Used now ONLY as a fallback for text-only responses (when no audio arrives)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Grace period before dropping to "idle" once the audio queue empties.
  // TTS synthesis lags behind text generation, so the queue legitimately
  // goes empty for short stretches *between* chunks of the same reply —
  // without this, the cloud flips to idle mid-speech the first time that
  // happens and nothing ever sets it back to "speaking" (only token
  // streaming did that, and by then text streaming is long finished).
  const audioIdleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const activeRequestIdRef = useRef<string | null>(null) // Phase 11.6: Track active request
  const isGeneratingRef = useRef(false) // Phase 11.7: Track if backend is still generating response

  useEffect(() => {
    const bridge = window.atlasBridge
    if (!bridge) {
      setConnected(false)
      return
    }

    const unsubscribe = bridge.onEvent((event) => {
      console.log("[Frontend] Received event:", event.type, event.payload);
      
      // Phase 11.6 & 11.7: Track request lifecycle
      if ((event.type as string) === "atlas.request_started") {
        activeRequestIdRef.current = typeof event.payload?.requestId === "string" ? event.payload.requestId : null;
        isGeneratingRef.current = true; // Backend is now actively generating the response
      } else if (event.type === "atlas.status" && event.payload?.phase === "reply_ready") {
        isGeneratingRef.current = false; // Backend LLM stream has finished
      }

      const nextState = stateForEvent(event)
      if (nextState) setState(nextState)

      const step = describeEvent(event)
      if (step) setSteps((prev) => [...prev, step])

      if (event.type === "atlas.streaming") {
        const token = typeof event.payload?.token === "string" ? event.payload.token : ""
        const reqId = typeof event.payload?.requestId === "string" ? event.payload.requestId : null
        
        // Phase 11.6: Ignore tokens from old interrupted requests
        if (!token || reqId !== activeRequestIdRef.current) return

        setTyping(false)
        setState("speaking") // Text is streaming, assume speaking unless no audio follows
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
        const reqId = typeof event.payload?.requestId === "string" ? event.payload.requestId : null
        // Optional per-chunk phoneme timestamps for lip-sync (see
        // hooks/useAudioViseme.ts). No current TTS provider sends this yet
        // — see "Required Backend Changes" — so this is undefined today and
        // AliceCloud's viseme-shape blending stays a no-op until it isn't.
        const phonemes = Array.isArray(event.payload?.phonemes)
          ? (event.payload.phonemes as PhonemeTimestamp[])
          : undefined

        // Phase 11.6: Ignore audio from old interrupted requests
        if (audioBase64 && reqId === activeRequestIdRef.current) {
          // Audio arrived! Cancel the text-only fallback timer.
          clearTimeout(settleTimer.current)
          queueAudio(audioBase64, phonemes)
        }
      }
      
      // Delayed replies from background tasks...
      else if (event.type === "atlas.response") {
        const text = typeof event.payload?.text === "string" ? event.payload.text : ""
        setTyping(false)
        setState("speaking")
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "atlas", text }])
        // Fallback timer in case this text has no TTS audio
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

  // Restore session
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
        // Backend not reachable yet
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

  // 10G: Audio Queue & Playback Manager (Now drives the UI State!)
  interface QueuedAudioChunk {
    audio: string
    /** Optional lip-sync timestamps for this chunk — see setVisemeSource(). */
    phonemes?: PhonemeTimestamp[]
  }
  const audioQueueRef = useRef<QueuedAudioChunk[]>([])
  const isPlayingRef = useRef(false)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)

  // How long we tolerate an empty queue before actually calling it "idle".
  // TTS synthesis for the next sentence chunk can easily take longer than
  // this to arrive even mid-reply, so this is a real gap, not a hair
  // trigger — just enough to smooth over the normal chunk-to-chunk lag.
  const AUDIO_IDLE_GRACE_MS = 600

  const playNextAudio = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false
      currentAudioRef.current = null
      setSpeechPlaying(false)
      setVisemeSource(null)
      
      // Phase 11.7: Only transition to IDLE if the backend is finished generating 
      // AND the audio queue is truly empty. Prevents UI flicker between streamed TTS chunks.
      //
      // But "queue is empty right now" isn't the same as "speech is over" —
      // the backend can still be synthesizing the next chunk. Wait out a
      // short grace window (cancelled the instant another chunk starts
      // playing, below) before actually dropping to idle, so a normal
      // synthesis gap mid-reply doesn't strand the cloud in idle's slow
      // ambient motion for the remainder of the speech.
      if (!isGeneratingRef.current) {
        clearTimeout(audioIdleTimer.current)
        audioIdleTimer.current = setTimeout(() => {
          if (!isPlayingRef.current) setState("idle")
        }, AUDIO_IDLE_GRACE_MS)
      }
      return
    }

    clearTimeout(audioIdleTimer.current)
    // Audio actually starting is what "speaking" means, full stop — not a
    // proxy inferred from token-streaming having happened at some earlier
    // point. This is what lets the cloud recover into "speaking" (with its
    // punch-transition bounce) even if it briefly dropped to idle above.
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
      setTimeout(() => {
        playNextAudio()
      }, 150)
    }
    audio.onerror = () => {
      console.error("Audio playback error, skipping to next chunk.")
      currentAudioRef.current = null 
      playNextAudio()
    }
    audio.play().catch(err => {
      console.error("Audio play failed:", err)
      currentAudioRef.current = null
      playNextAudio()
    })
  }, [])

  const queueAudio = useCallback((audioBase64: string, phonemes?: PhonemeTimestamp[]) => {
    audioQueueRef.current.push({ audio: audioBase64, phonemes })
    // If we weren't already playing, kick off the queue. 
    // The state transition to "speaking" happens inside playNextAudio when audio actually starts.
    if (!isPlayingRef.current) {
      playNextAudio()
    }
  }, [playNextAudio])

  // Phase 10.1: Systemic audio cancellation
  const stopAudioPlayback = useCallback(() => {
    audioQueueRef.current = [] // Clear pending chunks
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
    clearTimeout(settleTimer.current)
    
    // Phase 10.1: Kill active audio immediately
    stopAudioPlayback()

    setListening(false)
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: userText }])
    setSteps([])
    // If we were transcribing, transition to thinking. If we were idle, start thinking.
    setState("thinking")
    setTyping(true)

    const bridge = window.atlasBridge
    if (!bridge) {
      setTyping(false)
      setState("error")
      setEmotion("angry", 0.6)
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

    const result = await bridge.sendMessage(userText)
    setTyping(false)

    if (result.ok) {
      setState("speaking") // Assume speaking (if no audio chunks arrive, the fallback timer handles it)
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

      // Phase 11.3: Fallback timer. If no TTS audio arrives within 3 seconds, assume text-only and go idle.
      // This timer is cancelled instantly if queueAudio() receives an audio_chunk.
      settleTimer.current = setTimeout(() => setState("idle"), 3000)
    } else {
      setState("error")
      setEmotion("angry", 0.6)
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "atlas",
          text: result.error ?? "Something went wrong talking to Alice.",
        },
      ])
    }
  }, [stopAudioPlayback])

  useEffect(() => () => clearTimeout(settleTimer.current), [])

  // 9E: Microphone capture refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  
  // 11.8: VAD (Voice Activity Detection) refs
  const vadAudioContextRef = useRef<AudioContext | null>(null)
  const vadAnalyserRef = useRef<AnalyserNode | null>(null)
  const vadAnimationFrameRef = useRef<number | null>(null)
  const vadSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vadHasSpeechRef = useRef(false)
  
  // VAD Configuration (Tunable)
  const VAD_THRESHOLD = 0.02; // Volume required to be considered "speech" (0.0 - 1.0)
  const VAD_SILENCE_DURATION = 1500; // How long to wait in silence before stopping (ms)

  const startRecording = async () => {
    try {
      // Phase 11.6: BARGE-IN. Kill frontend audio AND tell backend to stop.
      stopAudioPlayback()
      clearTimeout(settleTimer.current)
      
      // Tell backend to permanently cancel the old TTS/LLM stream
      try {
        await (window.atlasBridge as any).interrupt()
        activeRequestIdRef.current = null // Clear local tracking
      } catch (e) {
        console.warn("Backend interrupt failed", e)
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
          // Phase 11.10: Explicit TRANSCRIBING state before transitioning to THINKING
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
          } catch (err) {
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

      // --- 11.8: START VAD ---
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
        if (!vadAnalyserRef.current || !mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
          return // Stop loop if recording stopped
        }

        vadAnalyserRef.current.getByteTimeDomainData(buffer)
        
        // Calculate RMS (Root Mean Square) volume
        let sum = 0
        for (let i = 0; i < buffer.length; i++) {
          const val = (buffer[i] - 128) / 128.0
          sum += val * val
        }
        const volume = Math.sqrt(sum / buffer.length)

        if (volume > VAD_THRESHOLD) {
          vadHasSpeechRef.current = true // User has started speaking
          if (vadSilenceTimerRef.current) {
            clearTimeout(vadSilenceTimerRef.current) // Cancel silence timer
            vadSilenceTimerRef.current = null
          }
        } else if (vadHasSpeechRef.current && !vadSilenceTimerRef.current) {
          // User was speaking, but is now silent. Start the grace period timer.
          vadSilenceTimerRef.current = setTimeout(() => {
            console.log("[VAD] Sustained silence detected. Stopping recording.")
            stopRecording()
          }, VAD_SILENCE_DURATION)
        }

        vadAnimationFrameRef.current = requestAnimationFrame(checkAudio)
      }

      checkAudio()

    } catch (err) {
      console.error("Microphone access denied or failed:", err)
      setState("error")
      setEmotion("angry", 0.5)
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "atlas", text: "I need microphone permissions to listen." },
      ])
    }
  }

  const stopRecording = () => {
    // --- 11.8: STOP VAD ---
    if (vadAnimationFrameRef.current) {
      cancelAnimationFrame(vadAnimationFrameRef.current)
      vadAnimationFrameRef.current = null
    }
    if (vadSilenceTimerRef.current) {
      clearTimeout(vadSilenceTimerRef.current)
      vadSilenceTimerRef.current = null
    }
    if (vadAudioContextRef.current) {
      vadAudioContextRef.current.close()
      vadAudioContextRef.current = null
      vadAnalyserRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
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
    const bridge = window.atlasBridge
    if (!bridge) return
    const result = await bridge.newConversation()
    resetLiveSession(result.sessionId)
  }, [resetLiveSession])

  const handleResumeConversation = useCallback(async (targetSessionId: string) => {
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
  }, [resetLiveSession, stopAudioPlayback])

  const handleConversationDeleted = useCallback(
    (newSessionId: string | null) => {
      if (newSessionId) resetLiveSession(newSessionId)
    },
    [resetLiveSession],
  )

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden">
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
          onResumeConversation={handleResumeConversation}
          onConversationDeleted={handleConversationDeleted}
        />
      )}

      {PLACEHOLDER_TABS[tab] && (
        <ComingSoon icon={PLACEHOLDER_TABS[tab].icon} label={PLACEHOLDER_TABS[tab].label} />
      )}
    </main>
  )
}
