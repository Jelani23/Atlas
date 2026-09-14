import type { AtlasBridge, AtlasEvent } from "./atlas-events"
import type { ConversationSummary, StoredMessage } from "./types"
import {
  deleteCloudConversation,
  getAtlasCloudSession,
  getCloudConversation,
  listCloudConversations,
  renameCloudConversation,
} from "./atlas-cloud"

export type AtlasConnectionState = "connecting" | "initializing" | "online" | "offline"

const DEFAULT_HOSTNAME = "desktop-alhaoc4.tail3338a8.ts.net"
const DEFAULT_PORT = 7341
const STORAGE_KEY = "atlas.remoteOrigin"
const RPC_TIMEOUT_MS = 15_000
const CONNECT_TIMEOUT_MS = 4_500
const RECONNECT_MS = 3_000

const connectionListeners = new Set<(state: AtlasConnectionState) => void>()
let connectionState: AtlasConnectionState = "connecting"
let browserBridge: WebAtlasBridge | null = null

function publishConnectionState(next: AtlasConnectionState) {
  connectionState = next
  connectionListeners.forEach((listener) => listener(next))
}

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, "")
}

function normalizeRemoteOrigin(value: string) {
  const trimmed = trimTrailingSlash(value)
  if (!trimmed) return getDefaultAtlasRemoteOrigin()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (typeof window !== "undefined" && window.location.protocol === "https:") return `https://${trimmed}`
  return `http://${trimmed}`
}

export function getDefaultAtlasRemoteOrigin() {
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return `https://${DEFAULT_HOSTNAME}`
  }
  return `http://${DEFAULT_HOSTNAME}:${DEFAULT_PORT}`
}

export function getAtlasRemoteOrigin() {
  if (typeof window === "undefined") return getDefaultAtlasRemoteOrigin()
  const saved = window.localStorage.getItem(STORAGE_KEY)
  return saved ? normalizeRemoteOrigin(saved) : getDefaultAtlasRemoteOrigin()
}

export function setAtlasRemoteOrigin(value: string) {
  if (typeof window === "undefined") return
  const normalized = normalizeRemoteOrigin(value)
  window.localStorage.setItem(STORAGE_KEY, normalized)
  browserBridge?.setOrigin(normalized)
}

export function resetAtlasRemoteOrigin() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(STORAGE_KEY)
  browserBridge?.setOrigin(getDefaultAtlasRemoteOrigin())
}

export function getAtlasConnectionState() {
  if (typeof window !== "undefined" && window.atlasBridge && !browserBridge) return "online" as const
  return connectionState
}

export function subscribeAtlasConnection(listener: (state: AtlasConnectionState) => void) {
  connectionListeners.add(listener)
  listener(getAtlasConnectionState())
  return () => connectionListeners.delete(listener)
}

export function retryAtlasConnection() {
  browserBridge?.retryNow()
}

function toWebSocketUrl(origin: string) {
  const url = new URL(origin)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = "/"
  url.search = ""
  url.hash = ""
  return url.toString()
}

interface PendingRpc {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

interface AtlasWebBridge extends AtlasBridge {
  transcribeAudio: (base64Audio: string) => Promise<{ ok: boolean; text?: string; error?: string }>
  interrupt: () => Promise<{ ok: boolean; error?: string }>
}

class WebAtlasBridge implements AtlasWebBridge {
  private origin: string
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private readyTimer: ReturnType<typeof setTimeout> | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private rpcCounter = 0
  private pending = new Map<string, PendingRpc>()
  private eventListeners = new Set<(event: AtlasEvent) => void>()
  private started = false

  constructor(origin: string) {
    this.origin = normalizeRemoteOrigin(origin)
    this.installResumeListeners()
    this.connect()
  }

  private installResumeListeners() {
    if (typeof window === "undefined") return
    window.addEventListener("online", () => this.retryNow())
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.socket?.readyState !== WebSocket.OPEN) this.retryNow()
    })
  }

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.readyTimer) clearTimeout(this.readyTimer)
    if (this.connectTimer) clearTimeout(this.connectTimer)
    this.reconnectTimer = null
    this.readyTimer = null
    this.connectTimer = null
  }

  private rejectPending(message: string) {
    this.pending.forEach(({ reject, timeout }) => {
      clearTimeout(timeout)
      reject(new Error(message))
    })
    this.pending.clear()
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, RECONNECT_MS)
  }

  private connect() {
    if (typeof window === "undefined") return
    if (this.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(this.socket.readyState)) return

    this.started = true
    publishConnectionState("connecting")

    let socket: WebSocket
    try {
      socket = new WebSocket(toWebSocketUrl(this.origin))
    } catch {
      publishConnectionState("offline")
      this.scheduleReconnect()
      return
    }

    this.socket = socket
    this.connectTimer = setTimeout(() => {
      if (socket.readyState === WebSocket.CONNECTING) socket.close()
    }, CONNECT_TIMEOUT_MS)

    socket.onopen = () => {
      if (this.connectTimer) clearTimeout(this.connectTimer)
      this.connectTimer = null
      publishConnectionState("initializing")
      void this.checkReady()
    }

    socket.onmessage = (message) => {
      let data: unknown
      try {
        data = JSON.parse(String(message.data))
      } catch {
        return
      }
      if (!data || typeof data !== "object") return
      const packet = data as Record<string, unknown>
      const id = typeof packet.id === "string" ? packet.id : null
      if (id && this.pending.has(id)) {
        const pending = this.pending.get(id)!
        this.pending.delete(id)
        clearTimeout(pending.timeout)
        if (typeof packet.error === "string") pending.reject(new Error(packet.error))
        else pending.resolve(packet.result)
        return
      }
      if (typeof packet.type === "string") {
        const event: AtlasEvent = {
          type: packet.type as AtlasEvent["type"],
          payload: packet.payload && typeof packet.payload === "object" ? (packet.payload as Record<string, unknown>) : {},
        }
        this.eventListeners.forEach((listener) => listener(event))
      }
    }

    socket.onerror = () => undefined
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null
      if (this.connectTimer) clearTimeout(this.connectTimer)
      if (this.readyTimer) clearTimeout(this.readyTimer)
      this.connectTimer = null
      this.readyTimer = null
      this.rejectPending("Atlas connection closed")
      publishConnectionState("offline")
      this.scheduleReconnect()
    }
  }

  private async checkReady() {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    try {
      const state = (await this.rpc("getState")) as { ready?: boolean }
      if (state?.ready) {
        publishConnectionState("online")
        return
      }
      publishConnectionState("initializing")
    } catch {
      // Keep the socket and retry while Atlas finishes initializing.
    }
    this.readyTimer = setTimeout(() => void this.checkReady(), 1_000)
  }

  private rpc(method: string, args: unknown[] = [], timeoutMs = RPC_TIMEOUT_MS): Promise<unknown> {
    if (this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Atlas is currently not active."))
    const id = `pwa-${Date.now()}-${++this.rpcCounter}`
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Atlas request timed out (${method})`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      this.socket!.send(JSON.stringify({ id, method, args }))
    })
  }

  setOrigin(origin: string) {
    const normalized = normalizeRemoteOrigin(origin)
    if (normalized === this.origin && this.started) {
      this.retryNow()
      return
    }
    this.origin = normalized
    this.clearTimers()
    this.rejectPending("Atlas connection changed")
    const oldSocket = this.socket
    this.socket = null
    if (oldSocket && oldSocket.readyState < WebSocket.CLOSING) oldSocket.close()
    this.connect()
  }

  retryNow() {
    this.clearTimers()
    const oldSocket = this.socket
    this.socket = null
    this.rejectPending("Retrying Atlas connection")
    if (oldSocket && oldSocket.readyState < WebSocket.CLOSING) oldSocket.close()
    this.connect()
  }

  async sendMessage(text: string) {
    try {
      return (await this.rpc("sendMessage", [text])) as { ok: boolean; reply?: string; error?: string }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Atlas is currently not active." }
    }
  }

  async getState() {
    try {
      return (await this.rpc("getState")) as { mode: string; sessionId: string | null; ready: boolean }
    } catch {
      return { mode: "work", sessionId: null, ready: false }
    }
  }

  async listModes() {
    try { return (await this.rpc("listModes")) as string[] } catch { return [] }
  }

  async setMode(mode: string) {
    try { return (await this.rpc("setMode", [mode])) as { ok: boolean; mode?: string; error?: string } }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Atlas is offline" } }
  }

  async resetConversation() {
    try { return (await this.rpc("resetConversation")) as { ok: boolean } } catch { return { ok: false } }
  }

  async listConversations(): Promise<ConversationSummary[]> {
    if (await getAtlasCloudSession()) {
      try { return await listCloudConversations() } catch { /* fall through to host */ }
    }
    try { return (await this.rpc("listConversations")) as ConversationSummary[] } catch { return [] }
  }

  async getConversation(sessionId: string): Promise<StoredMessage[]> {
    if (await getAtlasCloudSession()) {
      try { return await getCloudConversation(sessionId) } catch { /* fall through to host */ }
    }
    try { return (await this.rpc("getConversation", [sessionId])) as StoredMessage[] } catch { return [] }
  }

  async newConversation() {
    try { return (await this.rpc("newConversation")) as { ok: boolean; sessionId: string } }
    catch { return { ok: false, sessionId: `preview-${Date.now()}` } }
  }

  async resumeConversation(sessionId: string) {
    try { return (await this.rpc("resumeConversation", [sessionId])) as { ok: boolean; sessionId: string } }
    catch { return { ok: false, sessionId } }
  }

  async deleteConversation(sessionId: string) {
    if (await getAtlasCloudSession()) {
      try { return await deleteCloudConversation(sessionId) } catch { /* fall through */ }
    }
    try { return (await this.rpc("deleteConversation", [sessionId])) as { ok: boolean; newSessionId: string | null } }
    catch { return { ok: false, newSessionId: null } }
  }

  async renameConversation(sessionId: string, title: string) {
    if (await getAtlasCloudSession()) {
      try { return await renameCloudConversation(sessionId, title) } catch { /* fall through */ }
    }
    try { return (await this.rpc("renameConversation", [sessionId, title])) as { ok: boolean; title: string | null } }
    catch { return { ok: false, title: null } }
  }

  async transcribeAudio(base64Audio: string) {
    try {
      return (await this.rpc("transcribeAudio", [base64Audio], 60_000)) as { ok: boolean; text?: string; error?: string }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Atlas is offline" }
    }
  }

  async interrupt() {
    try { return (await this.rpc("interrupt")) as { ok: boolean; error?: string } }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Atlas is offline" } }
  }

  onEvent(callback: (event: AtlasEvent) => void) {
    this.eventListeners.add(callback)
    return () => this.eventListeners.delete(callback)
  }
}

export function ensureAtlasBridge(): AtlasBridge | undefined {
  if (typeof window === "undefined") return undefined
  if (window.atlasBridge && !browserBridge) {
    publishConnectionState("online")
    return window.atlasBridge
  }
  if (!browserBridge) {
    browserBridge = new WebAtlasBridge(getAtlasRemoteOrigin())
    window.atlasBridge = browserBridge
  }
  return browserBridge
}
